#!/usr/bin/env python3
"""Rafraichit mobile_benchmark.csv a partir du classement en direct
d'Artificial Analysis (avec Liquid AI) sur les petits modeles en telephone :
https://artificialanalysis.ai/hardware-inference-stack/mobile-phones

Depuis le 1er nov. 2026 : lecture directe des donnees de la page (charge
utile Next.js "self.__next_f.push", qui contient modeles, scores et mesures),
au lieu de l'extraction par Qwen de l'article de lancement (13 modeles, une
note inventee). Plus besoin d'Ollama.

Methode AA : builds 4 bits servis par llama.cpp (le moteur de Crampon), score
= moyenne simple de BFCL, IFBench, GPQA Diamond, MATH-500 et AA-Omniscience
(moitie exactitude, moitie non-hallucination). Score recalcule ici ; il
retombe sur les chiffres publies dans l'article (63, 63, 62, 61...).
Mesures : invite de 1 024 tokens + reponse de 256 (temps), memoire de pointe
a 4K de contexte, sur Galaxy S26 Ultra (Android, notre cas) et iPhone 17 Pro.

Usage: python3 refresh_mobile_benchmark.py
Lance quotidiennement via le meme timer que refresh_hf_catalogue.py."""
import csv
import json
import re
import sys
import os
from pathlib import Path

import requests

ROOT = Path(os.environ.get("CRAMPON_VEILLE_DATA", Path(__file__).parent))
CSV_PATH = ROOT / "mobile_benchmark.csv"
PAGE_URL = "https://artificialanalysis.ai/hardware-inference-stack/mobile-phones"
ANDROID, IPHONE = "Galaxy S26 Ultra", "iPhone 17 Pro"
CHAMPS = ["model", "quant", "score_16k", "score_64k", "bfcl", "ifbench", "gpqa", "math500", "non_hallucination",
          "omniscience_accuracy", "s26_e2e_s", "s26_tok_s", "s26_mem_go", "iphone_e2e_s", "iphone_mem_go"]


def donnees(html):
    """Objet {devices, models, measurements} reconstitue depuis les morceaux Next.js."""
    morceaux = re.findall(r'self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)', html)
    txt = "".join(json.loads(f'"{m}"') for m in morceaux)
    obj, _ = json.JSONDecoder().raw_decode(txt, txt.index('{"devices":'))
    return obj


def score(e):
    """Moyenne des 5 evaluations, sur 100 ; None si une manque."""
    try:
        o = e["omniscience"]
        omni = (o["accuracy"] + 1 - o["hallucinationRate"]) / 2
        return round(20 * (e["bfcl_small"]["score"] + e["ifbench"]["score"] + e["gpqa"]["score"]
                           + e["math_500"]["score"] + omni))
    except (KeyError, TypeError):
        return None


def pct(e, k):
    return round(100 * e[k]["score"]) if e.get(k, {}).get("score") is not None else ""


def main():
    resp = requests.get(PAGE_URL, headers={"User-Agent": "Mozilla/5.0"}, timeout=60)
    resp.raise_for_status()
    try:
        d = donnees(resp.text)
    except (ValueError, KeyError) as ex:
        print(f"ERREUR : donnees introuvables dans la page ({ex}) ; mobile_benchmark.csv inchange", file=sys.stderr)
        sys.exit(1)
    appareils = {x["deviceKey"]: x["name"] for x in d["devices"]}
    mesures = {(m["modelId"], appareils.get(m["deviceKey"]), m["metric"], m["prefillTokens"]): m["value"]
               for m in d["measurements"]}

    # une ligne par build (modele + quantification + mode) ; 16K et 64K fusionnes
    lignes = {}
    for m in d["models"]:
        nom = re.sub(r"\s*\((16|64)K Context\)", "", m["name"])
        nom = re.sub(r",\s*" + re.escape(m["quant"]) + r"\)", ")", nom).replace(f" ({m['quant']})", "")
        r = lignes.setdefault((nom, m["quant"]), {"model": nom, "quant": m["quant"]})
        e = m["evalScores"]
        if m["servedContextTokens"] == 65536:
            r["score_64k"] = score(e) or ""
            continue
        o = e.get("omniscience", {})
        r.update(score_16k=score(e) or "", bfcl=pct(e, "bfcl_small"), ifbench=pct(e, "ifbench"),
                 gpqa=pct(e, "gpqa"), math500=pct(e, "math_500"),
                 non_hallucination=round(100 * (1 - o["hallucinationRate"])) if o.get("hallucinationRate") is not None else "",
                 omniscience_accuracy=round(100 * o["accuracy"]) if o.get("accuracy") is not None else "")
        for app, pre in ((ANDROID, "s26"), (IPHONE, "iphone")):
            e2e = mesures.get((m["modelId"], app, "end_to_end_latency", 1024))
            tok = mesures.get((m["modelId"], app, "decode_throughput", 1024))
            mem = mesures.get((m["modelId"], app, "peak_memory", 4096))
            if e2e:
                r[f"{pre}_e2e_s"] = round(e2e / 1000, 1)  # millisecondes
            if mem:
                r[f"{pre}_mem_go"] = round(mem / 1e9, 1)  # octets
            if tok and pre == "s26":
                r["s26_tok_s"] = round(tok, 1)

    rows = sorted(lignes.values(), key=lambda r: -(r.get("score_16k") or 0))
    if len(rows) < 20:  # page changee : on garde l'ancien fichier
        print(f"ERREUR : {len(rows)} modeles seulement, mobile_benchmark.csv inchange", file=sys.stderr)
        sys.exit(1)
    with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CHAMPS)
        w.writeheader()
        w.writerows(rows)
    print(f"OK : {len(rows)} builds ({sum(1 for r in rows if r.get('s26_e2e_s'))} mesures sur {ANDROID}) -> {CSV_PATH}",
          file=sys.stderr)


if __name__ == "__main__":
    main()
