import sys
import json
import os
import numpy as np
import fasttext
import umap
import requests
from pathlib import Path


def download_model(url, model_path):
    """Download FastText model if not exists"""
    if os.path.exists(model_path):
        return True
    
    print(f"Downloading model from {url}...", file=sys.stderr)
    try:
        response = requests.get(url, stream=True)
        response.raise_for_status()
        
        os.makedirs(os.path.dirname(model_path), exist_ok=True)
        with open(model_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        print(f"Model downloaded to {model_path}", file=sys.stderr)
        return True
    except Exception as e:
        print(f"Failed to download model: {e}", file=sys.stderr)
        return False


def load_words(path=None):
    """Load base vocabulary words"""
    if path is None:
        script_dir = os.path.dirname(__file__)
        path = os.path.join(script_dir, "..", "..", "..", "words.txt")
    
    if not os.path.exists(path):
        # Fallback to common English words if words.txt doesn't exist
        return ["hello", "world", "computer", "language", "intelligence", "neural", "network", 
                "machine", "learning", "artificial", "natural", "processing", "algorithm", 
                "data", "science", "technology", "programming", "software", "application"]
    
    with open(path, "r") as f:
        return [w.strip() for w in f if w.strip()]


def load_models():
    """Load FastText embedding and language detection models"""
    models_dir = os.path.join(os.path.dirname(__file__), "models")
    
    # FastText Common Crawl model (English, smaller version)
    embedding_model_path = os.path.join(models_dir, "cc.en.300.bin")
    embedding_url = "https://dl.fbaipublicfiles.com/fasttext/vectors-crawl/cc.en.300.bin.gz"
    
    # Language detection model (already exists in project)
    lang_model_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", 
                                  "shader-playground", "public", "models", "lid.176.ftz")
    
    # For now, use a simpler approach - load embedding model only
    # Language detection will be implemented separately
    embedding_model = None
    lang_model = None
    
    try:
        # Try to load existing model or use smaller fallback approach
        if os.path.exists(embedding_model_path):
            embedding_model = fasttext.load_model(embedding_model_path)
        else:
            print("Using fallback embedding approach (no FastText model found)", file=sys.stderr)
        
        # Load language detection model if available
        if os.path.exists(lang_model_path):
            lang_model = fasttext.load_model(lang_model_path)
            
    except Exception as e:
        print(f"Model loading error: {e}", file=sys.stderr)
    
    return embedding_model, lang_model


def compute_umap_reducer(embedding_model, base_words):
    """Compute UMAP reducer based on base vocabulary"""
    if not embedding_model:
        return None
        
    vectors = []
    valid_words = []
    
    for word in base_words:
        try:
            vec = embedding_model.get_word_vector(word)
            vectors.append(vec)
            valid_words.append(word)
        except:
            continue
    
    if len(vectors) < 3:
        return None
        
    # Create UMAP reducer
    reducer = umap.UMAP(
        n_components=3,
        random_state=42,
        n_neighbors=min(15, len(vectors)//2),
        min_dist=0.1,
        metric='cosine'
    )
    
    # Fit on base vocabulary
    vectors_array = np.array(vectors)
    reducer.fit(vectors_array)
    
    return reducer


def embed_word(word, embedding_model, reducer, scale=4.0):
    """Generate 3D embedding for a word"""
    if not embedding_model or not reducer:
        # Fallback to hash-based positioning
        return {
            "label": word,
            "x": round((hash(word) % 1000) / 1000 - 0.5, 2) * scale,
            "y": round((hash(word[::-1]) % 1000) / 1000 - 0.5, 2) * scale,
            "z": round((hash(word + word) % 1000) / 1000 - 0.5, 2) * scale
        }
    
    try:
        # Get FastText vector
        vector = embedding_model.get_word_vector(word)
        
        # Transform to 3D using UMAP
        point_3d = reducer.transform([vector])[0]
        
        return {
            "label": word,
            "x": round(float(point_3d[0]) * scale, 2),
            "y": round(float(point_3d[1]) * scale, 2),
            "z": round(float(point_3d[2]) * scale, 2)
        }
    except Exception as e:
        print(f"Embedding error for '{word}': {e}", file=sys.stderr)
        # Fallback
        return {
            "label": word,
            "x": round((hash(word) % 1000) / 1000 - 0.5, 2) * scale,
            "y": round((hash(word[::-1]) % 1000) / 1000 - 0.5, 2) * scale,
            "z": round((hash(word + word) % 1000) / 1000 - 0.5, 2) * scale
        }


def detect_language(text, lang_model):
    """Detect language of text"""
    if not lang_model:
        return {"language": "en", "confidence": 1.0}
    
    try:
        # Clean text for language detection
        clean_text = text.replace('\n', ' ').strip()
        if not clean_text:
            return {"language": "en", "confidence": 1.0}
        
        predictions = lang_model.predict(clean_text, k=1)
        language = predictions[0][0].replace('__label__', '')
        confidence = float(predictions[1][0])
        
        return {"language": language, "confidence": confidence}
    except Exception as e:
        print(f"Language detection error: {e}", file=sys.stderr)
        return {"language": "en", "confidence": 0.5}


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--server":
        # Server mode - process words from stdin
        print("Loading FastText models...", file=sys.stderr)
        
        base_words = load_words()
        embedding_model, lang_model = load_models()
        reducer = compute_umap_reducer(embedding_model, base_words)
        
        print("FastText embedding service ready", file=sys.stderr)
        
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
                
            try:
                # Parse command
                if line.startswith("EMBED:"):
                    word = line[6:].strip()
                    result = embed_word(word, embedding_model, reducer)
                    print(json.dumps(result), flush=True)
                elif line.startswith("LANG:"):
                    text = line[5:].strip()
                    result = detect_language(text, lang_model)
                    print(json.dumps(result), flush=True)
                else:
                    # Default to embedding for backward compatibility
                    result = embed_word(line, embedding_model, reducer)
                    print(json.dumps(result), flush=True)
            except Exception as e:
                error_result = {"error": str(e)}
                print(json.dumps(error_result), flush=True)
        return

    # Command line mode
    if len(sys.argv) < 2:
        print(json.dumps({"error": "missing word"}))
        return

    command = sys.argv[1]
    
    if command == "detect-language" and len(sys.argv) > 2:
        text = " ".join(sys.argv[2:])
        _, lang_model = load_models()
        result = detect_language(text, lang_model)
        print(json.dumps(result))
    else:
        # Embedding mode
        word = command
        base_words = load_words()
        embedding_model, _ = load_models()
        reducer = compute_umap_reducer(embedding_model, base_words)
        result = embed_word(word, embedding_model, reducer)
        print(json.dumps(result))


if __name__ == "__main__":
    main()