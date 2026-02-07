import sys
import json
import os
import numpy as np

GENSIM_IMPORT_ERROR = None
SKLEARN_IMPORT_ERROR = None

try:
    import gensim.downloader as api
except Exception as err:  # pragma: no cover - env-dependent
    api = None
    GENSIM_IMPORT_ERROR = err

try:
    from sklearn.decomposition import PCA
except Exception as err:  # pragma: no cover - env-dependent
    PCA = None
    SKLEARN_IMPORT_ERROR = err


def load_words(path=None):
    if path is None:
        script_dir = os.path.dirname(__file__)
        path = os.path.join(script_dir, "..", "words.txt")
    with open(path, "r") as f:
        return [w.strip() for w in f if w.strip()]


def load_model():
    if api is None:
        return None
    return api.load("glove-wiki-gigaword-100")


def compute_pca(model, base_words):
    if model is None or PCA is None:
        return None, None

    vectors = []
    for word in base_words:
        vec = None
        for key in (word, word.lower()):
            if key in model:
                vec = model[key]
                break
        if vec is None:
            vec = np.zeros(model.vector_size)
        vectors.append(vec)
    pca = PCA(n_components=3)
    reduced = pca.fit_transform(vectors)
    max_abs = np.max(np.abs(reduced))
    return pca, max_abs


def embed_word(word, model, pca, max_abs):
    if model is None or pca is None or not max_abs:
        return {
            "label": word,
            "x": round((hash(word) % 1000) / 1000 - 0.5, 2),
            "y": round((hash(word[::-1]) % 1000) / 1000 - 0.5, 2),
            "z": round((hash(word + word) % 1000) / 1000 - 0.5, 2)
        }

    scale = 8
    vec = None
    for key in (word, word.lower()):
        if key in model:
            vec = model[key]
            break
    if vec is None:
        return {
            "label": word,
            "x": round((hash(word) % 1000) / 1000 - 0.5, 2),
            "y": round((hash(word[::-1]) % 1000) / 1000 - 0.5, 2),
            "z": round((hash(word + word) % 1000) / 1000 - 0.5, 2)
        }
    reduced = pca.transform([vec])[0]
    reduced = reduced / max_abs * 0.5 *scale
    return {
        "label": word,
        "x": round(float(reduced[0]), 2),
        "y": round(float(reduced[1]), 2),
        "z": round(float(reduced[2]), 2)
    }


def main():
    if GENSIM_IMPORT_ERROR:
        print(
            f"[embedding-service] gensim unavailable, using fallback embeddings: {GENSIM_IMPORT_ERROR}",
            file=sys.stderr
        )
    if SKLEARN_IMPORT_ERROR:
        print(
            f"[embedding-service] scikit-learn unavailable, using fallback embeddings: {SKLEARN_IMPORT_ERROR}",
            file=sys.stderr
        )

    if len(sys.argv) > 1 and sys.argv[1] == "--server":
        base_words = load_words()
        model = load_model()
        pca, max_abs = compute_pca(model, base_words)
        for line in sys.stdin:
            word = line.strip()
            if not word:
                continue
            result = embed_word(word, model, pca, max_abs)
            print(json.dumps(result), flush=True)
        return

    if len(sys.argv) < 2:
        print(json.dumps({"error": "missing word"}))
        return

    word = sys.argv[1]
    base_words = load_words()
    model = load_model()
    pca, max_abs = compute_pca(model, base_words)
    result = embed_word(word, model, pca, max_abs)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
