#!/usr/bin/env python3
"""
Generate a structured EN/ES seed batch for scaling the local corpus.

The generated documents are "topic cards" intended for retrieval load-testing
and demo breadth. They use real Wikipedia root URLs but distinct document IDs.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Dict, List


ENTITIES: List[Dict[str, str]] = [
    {
        "slug": "madrid",
        "name_en": "Madrid",
        "name_es": "Madrid",
        "url_en": "https://en.wikipedia.org/wiki/Madrid",
        "url_es": "https://es.wikipedia.org/wiki/Madrid",
    },
    {
        "slug": "valencia",
        "name_en": "Valencia",
        "name_es": "Valencia",
        "url_en": "https://en.wikipedia.org/wiki/Valencia",
        "url_es": "https://es.wikipedia.org/wiki/Valencia",
    },
    {
        "slug": "seville",
        "name_en": "Seville",
        "name_es": "Sevilla",
        "url_en": "https://en.wikipedia.org/wiki/Seville",
        "url_es": "https://es.wikipedia.org/wiki/Sevilla",
    },
    {
        "slug": "bilbao",
        "name_en": "Bilbao",
        "name_es": "Bilbao",
        "url_en": "https://en.wikipedia.org/wiki/Bilbao",
        "url_es": "https://es.wikipedia.org/wiki/Bilbao",
    },
    {
        "slug": "malaga",
        "name_en": "Malaga",
        "name_es": "Malaga",
        "url_en": "https://en.wikipedia.org/wiki/M%C3%A1laga",
        "url_es": "https://es.wikipedia.org/wiki/M%C3%A1laga",
    },
    {
        "slug": "zaragoza",
        "name_en": "Zaragoza",
        "name_es": "Zaragoza",
        "url_en": "https://en.wikipedia.org/wiki/Zaragoza",
        "url_es": "https://es.wikipedia.org/wiki/Zaragoza",
    },
    {
        "slug": "granada",
        "name_en": "Granada",
        "name_es": "Granada",
        "url_en": "https://en.wikipedia.org/wiki/Granada",
        "url_es": "https://es.wikipedia.org/wiki/Granada",
    },
    {
        "slug": "toledo",
        "name_en": "Toledo",
        "name_es": "Toledo",
        "url_en": "https://en.wikipedia.org/wiki/Toledo,_Spain",
        "url_es": "https://es.wikipedia.org/wiki/Toledo",
    },
    {
        "slug": "salamanca",
        "name_en": "Salamanca",
        "name_es": "Salamanca",
        "url_en": "https://en.wikipedia.org/wiki/Salamanca",
        "url_es": "https://es.wikipedia.org/wiki/Salamanca",
    },
    {
        "slug": "cordoba",
        "name_en": "Cordoba",
        "name_es": "Cordoba",
        "url_en": "https://en.wikipedia.org/wiki/C%C3%B3rdoba,_Spain",
        "url_es": "https://es.wikipedia.org/wiki/C%C3%B3rdoba_(Espa%C3%B1a)",
    },
    {
        "slug": "san_sebastian",
        "name_en": "San Sebastian",
        "name_es": "San Sebastian",
        "url_en": "https://en.wikipedia.org/wiki/San_Sebasti%C3%A1n",
        "url_es": "https://es.wikipedia.org/wiki/San_Sebasti%C3%A1n",
    },
    {
        "slug": "santiago",
        "name_en": "Santiago de Compostela",
        "name_es": "Santiago de Compostela",
        "url_en": "https://en.wikipedia.org/wiki/Santiago_de_Compostela",
        "url_es": "https://es.wikipedia.org/wiki/Santiago_de_Compostela",
    },
    {
        "slug": "alicante",
        "name_en": "Alicante",
        "name_es": "Alicante",
        "url_en": "https://en.wikipedia.org/wiki/Alicante",
        "url_es": "https://es.wikipedia.org/wiki/Alicante",
    },
    {
        "slug": "murcia",
        "name_en": "Murcia",
        "name_es": "Murcia",
        "url_en": "https://en.wikipedia.org/wiki/Murcia",
        "url_es": "https://es.wikipedia.org/wiki/Murcia",
    },
]


INTENTS = [
    {
        "slug": "overview",
        "label_en": "overview",
        "label_es": "resumen",
        "template_en": (
            "{entity} can be introduced with a short overview focused on context, key facts, and practical orientation for a learner. "
            "This card highlights why {entity} matters in everyday conversations and travel planning."
        ),
        "template_es": (
            "{entity} se puede presentar con un resumen corto centrado en contexto, datos clave y orientacion practica para el estudiante. "
            "Esta ficha explica por que {entity} importa en conversaciones reales y en planes de viaje."
        ),
    },
    {
        "slug": "historical_note",
        "label_en": "historical note",
        "label_es": "nota historica",
        "template_en": (
            "A tutoring answer about {entity} should include a concise historical frame and one present-day connection. "
            "Learners can use this context to compare past and present when practicing speaking."
        ),
        "template_es": (
            "Una respuesta sobre {entity} puede incluir un marco historico breve y una conexion con el presente. "
            "El estudiante puede usar este contexto para comparar pasado y actualidad al practicar expresion oral."
        ),
    },
    {
        "slug": "social_context",
        "label_en": "social context",
        "label_es": "contexto social",
        "template_en": (
            "{entity} can be explained through social context, community life, and common interaction patterns. "
            "This helps learners describe places while keeping responses short and practical."
        ),
        "template_es": (
            "{entity} se puede explicar desde contexto social, vida comunitaria y patrones de interaccion habituales. "
            "Esto ayuda al estudiante a describir lugares con respuestas breves y practicas."
        ),
    },
    {
        "slug": "communication_phrases",
        "label_en": "communication phrases",
        "label_es": "frases de comunicacion",
        "template_en": (
            "A tutor can connect {entity} to communication phrases learners can actually reuse in conversation. "
            "The emphasis is confidence, turn-taking, and clarity rather than long explanations."
        ),
        "template_es": (
            "El tutor puede conectar {entity} con frases de comunicacion que el estudiante pueda reutilizar en conversacion. "
            "El enfoque es confianza, toma de turnos y claridad, no explicaciones largas."
        ),
    },
    {
        "slug": "learner_reflection",
        "label_en": "learner reflection",
        "label_es": "reflexion del estudiante",
        "template_en": (
            "This card about {entity} is designed for learner reflection: what was understood, what was difficult, and what to practice next. "
            "It supports short follow-up questions and active speaking."
        ),
        "template_es": (
            "Esta ficha sobre {entity} esta pensada para reflexion del estudiante: que entendio, que fue dificil y que practicar despues. "
            "Apoya preguntas de seguimiento cortas y produccion oral activa."
        ),
    },
    {
        "slug": "local_customs",
        "label_en": "local customs",
        "label_es": "costumbres locales",
        "template_en": (
            "{entity} can be presented through local customs, everyday routines, and polite interaction norms. "
            "Learners can practice describing habits and asking respectful questions."
        ),
        "template_es": (
            "{entity} se puede presentar mediante costumbres locales, rutinas y normas de trato. "
            "El estudiante practica como describir habitos y hacer preguntas con respeto."
        ),
    },
    {
        "slug": "seasonal_context",
        "label_en": "seasonal context",
        "label_es": "contexto estacional",
        "template_en": (
            "A seasonal context around {entity} helps learners compare experiences across different times of year. "
            "This supports descriptive language and simple contrast structures."
        ),
        "template_es": (
            "El contexto estacional de {entity} ayuda a comparar experiencias en distintas epocas del ano. "
            "Esto favorece lenguaje descriptivo y estructuras de contraste sencillas."
        ),
    },
    {
        "slug": "comparison_prompt",
        "label_en": "comparison prompt",
        "label_es": "pregunta comparativa",
        "template_en": (
            "{entity} can be used in comparison prompts where the learner contrasts it with another place they know. "
            "The tutor can ask concise questions to expand vocabulary naturally."
        ),
        "template_es": (
            "{entity} se puede usar en preguntas comparativas, contrastandolo con otro lugar conocido por el estudiante. "
            "El tutor puede hacer preguntas breves para ampliar vocabulario de forma natural."
        ),
    },
    {
        "slug": "cv_story",
        "label_en": "portfolio and interview angle",
        "label_es": "enfoque de portfolio e entrevista",
        "template_en": (
            "{entity} can be used as a portfolio example to show source-aware retrieval and concise explanation skills. "
            "This card supports interview-style practice where the learner explains facts with citations."
        ),
        "template_es": (
            "{entity} se puede usar como ejemplo de portfolio para demostrar recuperacion con fuentes y explicacion concisa. "
            "Esta ficha sirve para practicar un estilo de entrevista con hechos y citas."
        ),
    },
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate EN/ES seed topic cards for corpus scaling.")
    parser.add_argument(
        "--output",
        default="retrieval-service/data/import/seed_scale_batch_001.jsonl",
        help="Output JSONL path (default: retrieval-service/data/import/seed_scale_batch_001.jsonl)",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite output file if it already exists.",
    )
    parser.add_argument(
        "--source",
        default="Wikipedia",
        help="Source label to use in generated records (default: Wikipedia).",
    )
    parser.add_argument(
        "--target-records",
        type=int,
        default=252,
        help="How many records to keep from generated set (default: 252).",
    )
    return parser.parse_args()


def make_record(entity: Dict[str, str], intent: Dict[str, str], lang: str, source: str) -> Dict[str, str]:
    if lang == "en":
        entity_name = entity["name_en"]
        content = intent["template_en"].format(entity=entity_name)
        title = f"{entity_name} - {intent['label_en']} (seed card)"
        url = entity["url_en"]
    else:
        entity_name = entity["name_es"]
        content = intent["template_es"].format(entity=entity_name)
        title = f"{entity_name} - {intent['label_es']} (ficha base)"
        url = entity["url_es"]

    record_id = f"seed_{entity['slug']}_{intent['slug']}_{lang}"
    return {
        "id": record_id,
        "title": title,
        "url": url,
        "source": source,
        "language": lang,
        "published_at": None,
        "content": content,
    }


def main() -> int:
    args = parse_args()
    output = Path(args.output)
    if output.exists() and not args.overwrite:
        print(f"Output exists: {output}. Use --overwrite to replace.")
        return 1

    records: List[Dict[str, str]] = []
    for entity in ENTITIES:
        for intent in INTENTS:
            records.append(make_record(entity, intent, "en", args.source))
            records.append(make_record(entity, intent, "es", args.source))

    target = max(2, int(args.target_records))
    if target % 2 != 0:
        target -= 1
    if target < len(records):
        records = records[:target]

    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False))
            handle.write("\n")

    print(f"Wrote seed batch: {output}")
    print(f"Generated records: {len(records)}")
    print(f"Expected EN/ES split: {len(records)//2} / {len(records)//2}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
