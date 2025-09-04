import sys
import json
import os
import numpy as np
import hashlib
from pathlib import Path

# Try to import optional dependencies
try:
    import umap
    UMAP_AVAILABLE = True
except ImportError:
    UMAP_AVAILABLE = False

try:
    import fasttext
    FASTTEXT_AVAILABLE = True
except ImportError:
    FASTTEXT_AVAILABLE = False


def load_words(path=None):
    """Load base vocabulary words"""
    if path is None:
        script_dir = os.path.dirname(__file__)
        path = os.path.join(script_dir, "..", "..", "..", "words.txt")
    
    if not os.path.exists(path):
        # Fallback to common English words if words.txt doesn't exist
        return ["hello", "world", "computer", "language", "intelligence", "neural", "network", 
                "machine", "learning", "artificial", "natural", "processing", "algorithm", 
                "data", "science", "technology", "programming", "software", "application",
                "system", "code", "function", "variable", "class", "method", "object",
                "string", "number", "array", "list", "dictionary", "database", "server",
                "client", "web", "internet", "protocol", "security", "encryption", "user"]
    
    with open(path, "r") as f:
        return [w.strip() for w in f if w.strip()]


def simple_word_hash(word):
    """Generate consistent hash-based embedding for a word"""
    # Create multiple hash seeds for different dimensions
    hash1 = int(hashlib.md5(word.encode()).hexdigest()[:8], 16)
    hash2 = int(hashlib.md5((word + "_x").encode()).hexdigest()[:8], 16)
    hash3 = int(hashlib.md5((word + "_y").encode()).hexdigest()[:8], 16)
    hash4 = int(hashlib.md5((word + "_z").encode()).hexdigest()[:8], 16)
    
    # Normalize to [-1, 1] range
    x = (hash1 % 10000) / 5000.0 - 1.0
    y = (hash2 % 10000) / 5000.0 - 1.0  
    z = (hash3 % 10000) / 5000.0 - 1.0
    
    # Add some semantic clustering based on word characteristics
    word_lower = word.lower()
    
    # Adjust position based on word properties
    if word_lower.endswith('ing'):  # Verbs/actions cluster
        x += 0.3
    elif word_lower.endswith('ed'):  # Past tense
        x += 0.2
    elif word_lower.endswith('ly'):  # Adverbs
        y += 0.3
    elif word_lower.endswith('tion') or word_lower.endswith('sion'):  # Abstract nouns
        z += 0.3
    elif word_lower in ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for']:  # Function words
        x -= 0.4
        y -= 0.4
    
    # Word length influence
    length_factor = min(len(word), 10) / 10.0
    x *= (0.5 + length_factor * 0.5)
    y *= (0.5 + length_factor * 0.5)
    z *= (0.5 + length_factor * 0.5)
    
    return np.array([x, y, z])


def improved_semantic_embedding(word, base_words):
    """Generate improved semantic embeddings based on word relationships"""
    word_lower = word.lower()
    
    # Start with hash-based position
    base_pos = simple_word_hash(word)
    
    # Define semantic categories and their positions in 3D space
    semantic_clusters = {
        # Technology cluster (positive x)
        'tech': {
            'center': np.array([2.0, 0.0, 0.0]),
            'words': ['computer', 'software', 'algorithm', 'data', 'network', 'system', 
                     'code', 'programming', 'technology', 'digital', 'artificial', 'machine']
        },
        # Natural/organic cluster (negative x)
        'natural': {
            'center': np.array([-2.0, 0.0, 0.0]),
            'words': ['natural', 'organic', 'human', 'nature', 'life', 'biological',
                     'earth', 'tree', 'animal', 'plant', 'water', 'air']
        },
        # Action/verb cluster (positive y)
        'action': {
            'center': np.array([0.0, 2.0, 0.0]),
            'words': ['run', 'walk', 'jump', 'think', 'learn', 'create', 'build',
                     'process', 'analyze', 'compute', 'generate', 'execute']
        },
        # Abstract concepts (positive z)
        'abstract': {
            'center': np.array([0.0, 0.0, 2.0]),
            'words': ['intelligence', 'knowledge', 'wisdom', 'understanding', 'concept',
                     'theory', 'principle', 'philosophy', 'logic', 'reasoning']
        },
        # Communication cluster (negative y)
        'communication': {
            'center': np.array([0.0, -2.0, 0.0]),
            'words': ['language', 'speech', 'text', 'word', 'communication', 'talk',
                     'say', 'speak', 'write', 'read', 'message', 'information']
        }
    }
    
    # Find best matching cluster
    best_cluster = None
    max_similarity = 0
    
    for cluster_name, cluster_info in semantic_clusters.items():
        similarity = 0
        for cluster_word in cluster_info['words']:
            if cluster_word in word_lower or word_lower in cluster_word:
                similarity += 1
            # Check for common substrings
            if len(cluster_word) > 3 and cluster_word[:3] in word_lower:
                similarity += 0.5
            if len(cluster_word) > 4 and cluster_word[-3:] in word_lower:
                similarity += 0.5
        
        if similarity > max_similarity:
            max_similarity = similarity
            best_cluster = cluster_info
    
    # Blend base position with semantic cluster
    if best_cluster and max_similarity > 0:
        cluster_weight = min(max_similarity / 3.0, 0.7)  # Max 70% cluster influence
        base_pos = (1 - cluster_weight) * base_pos + cluster_weight * best_cluster['center']
    
    return base_pos


def embed_word(word, base_words=None, scale=8.0):
    """Generate 3D embedding for a word"""
    if base_words is None:
        base_words = load_words()
    
    # Use improved semantic embedding
    point_3d = improved_semantic_embedding(word, base_words)
    
    return {
        "label": word,
        "x": round(float(point_3d[0]) * scale, 2),
        "y": round(float(point_3d[1]) * scale, 2),
        "z": round(float(point_3d[2]) * scale, 2)
    }


def detect_language_simple(text):
    """Simple language detection based on character patterns and common words"""
    text_lower = text.lower()
    
    # Common words by language (for single word detection)
    spanish_words = {'gracias', 'hola', 'si', 'no', 'por', 'favor', 'que', 'como', 'donde', 'cuando', 'buenos', 'dias', 'noches'}
    french_words = {'bonjour', 'merci', 'oui', 'non', 'comment', 'allez', 'vous', 'je', 'tu', 'il', 'elle', 'nous', 'bonsoir'}
    german_words = {'hallo', 'danke', 'ja', 'nein', 'wie', 'geht', 'ihnen', 'guten', 'tag', 'morgen', 'abend', 'bitte'}
    italian_words = {'ciao', 'grazie', 'prego', 'come', 'sta', 'bene', 'male', 'buongiorno', 'buonasera', 'arrivederci'}
    
    # Check for common words first
    if text_lower in spanish_words:
        return {"language": "es", "confidence": 0.9}
    elif text_lower in french_words:
        return {"language": "fr", "confidence": 0.9}
    elif text_lower in german_words:
        return {"language": "de", "confidence": 0.9}
    elif text_lower in italian_words:
        return {"language": "it", "confidence": 0.9}
    
    # Fall back to character-based detection
    if any(char in text for char in 'áéíóúñüç'):
        return {"language": "es", "confidence": 0.7}  # Spanish
    elif any(char in text for char in 'àâäèéêëîïôöùûüÿç'):
        return {"language": "fr", "confidence": 0.7}  # French
    elif any(char in text for char in 'äöüß'):
        return {"language": "de", "confidence": 0.7}  # German
    elif any(char in text for char in 'àèìòù'):
        return {"language": "it", "confidence": 0.7}  # Italian
    elif any(ord(char) > 127 for char in text):
        # Non-ASCII characters suggest non-English
        return {"language": "unknown", "confidence": 0.5}
    else:
        # Default to English
        return {"language": "en", "confidence": 0.8}


def detect_language(text, lang_model=None):
    """Detect language of text"""
    if FASTTEXT_AVAILABLE and lang_model:
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
            print(f"FastText language detection error: {e}", file=sys.stderr)
    
    # Fallback to simple detection
    return detect_language_simple(text)


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--server":
        # Server mode - process commands from stdin
        print("Loading embedding service...", file=sys.stderr)
        
        base_words = load_words()
        lang_model = None
        
        # Try to load language detection model if available
        if FASTTEXT_AVAILABLE:
            try:
                lang_model_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", 
                                              "shader-playground", "public", "models", "lid.176.ftz")
                if os.path.exists(lang_model_path):
                    lang_model = fasttext.load_model(lang_model_path)
                    print("FastText language model loaded", file=sys.stderr)
            except Exception as e:
                print(f"Could not load FastText language model: {e}", file=sys.stderr)
        
        print("Simple embedding service ready", file=sys.stderr)
        
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
                
            try:
                # Parse command
                if line.startswith("EMBED:"):
                    word = line[6:].strip()
                    result = embed_word(word, base_words)
                    print(json.dumps(result), flush=True)
                elif line.startswith("LANG:"):
                    text = line[5:].strip()
                    result = detect_language(text, lang_model)
                    print(json.dumps(result), flush=True)
                else:
                    # Default to embedding for backward compatibility
                    result = embed_word(line, base_words)
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
        result = detect_language(text)
        print(json.dumps(result))
    else:
        # Embedding mode
        word = command
        base_words = load_words()
        result = embed_word(word, base_words)
        print(json.dumps(result))


if __name__ == "__main__":
    main()