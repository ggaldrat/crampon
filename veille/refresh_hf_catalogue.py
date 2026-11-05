#!/usr/bin/env python3
"""Rafraichit le catalogue des modeles GGUF utilisables par Crampon (fork de
PocketPal, moteur llama.cpp via llama.rn) -> hf_gguf_catalogue.csv, et
journalise les nouveautes (doc/hf_gguf_history/).

Remplace la veille LiteRT-LM (archivee dans archive-litert/) depuis le choix
du 31 oct. 2026 de garder pocketpal-ai comme base.

- Sources : une liste d'editeurs fiables (convertisseurs + editeurs officiels),
  pas tout Hugging Face (100 000+ depots GGUF, surtout des fine-tunes).
- Filtre : <= MAX_PARAMS parametres, non gated, pas d'embedding/TTS/brouillon.
- Compatibilite : architecture comparee a celles du llama.cpp embarque dans
  l'appli (node_modules/llama.rn/vendor/llama.cpp/src/llama-arch.cpp).
- Tailles : fichiers Q4_K_M, Q4_0 et Q8_0 (arbre du depot, lu une fois par
  depot nouveau ou modifie).
- Regles PocketPal : la version publiee de pocketpal-device-rules (que l'appli
  telecharge seule) est suivie, et ses changements journalises.

Usage: python3 refresh_hf_catalogue.py
Lance quotidiennement via systemd timer (voir setup_hf_catalogue_timer.sh)."""
import csv
import datetime
import json
import re
import sys
import time
import os
from pathlib import Path

import requests

# Scripts in the app repo (veille/), data in the directory named by
# CRAMPON_VEILLE_DATA (the veille-data branch on GitHub), here by default.
ROOT = Path(os.environ.get("CRAMPON_VEILLE_DATA", Path(__file__).parent))
APP = Path(__file__).parent.parent
CSV_PATH = ROOT / "hf_gguf_catalogue.csv"
HISTORY_DIR = ROOT / "hf_gguf_history"
STATE_PATH = HISTORY_DIR / "catalogue.json"
ARCH_SRC = APP / "node_modules/llama.rn/vendor/llama.cpp/src/llama-arch.cpp"
RULES_URL = "https://raw.githubusercontent.com/a-ghorbani/pocketpal-device-rules/main/rules.android.v2.json"
RULES_PATH = HISTORY_DIR / "rules.android.v2.json"
# architectures lues par chaque version de l'appli : sert a poser min_app_version
# dans les regles, pour qu'un telephone a l'ancien moteur ne recoive pas un
# modele qu'il ne sait pas charger. Amorce : 1.19.1 = llama.rn 0.13.0-rc.7.
ARCHS_VERSIONS_PATH = HISTORY_DIR / "archs_par_version.json"
GRADLE = APP / "android/app/build.gradle"

HF_API = "https://huggingface.co/api/models"
# convertisseurs d'abord : ordre = preference quand plusieurs editeurs publient le meme modele
EDITEURS = ["lmstudio-community", "unsloth", "bartowski", "ggml-org",
            "Qwen", "LiquidAI", "google", "ibm-granite", "microsoft", "mistralai", "HuggingFaceTB",
            "allenai", "nvidia", "deepseek-ai", "openbmb", "tiiuae", "prism-ml", "meta-llama"]
MAX_PARAMS = 9.5e9
ARCH_EXCLUES = {"clip", "bert", "modern-bert", "nomic-bert", "nomic-bert-moe", "neo-bert", "jina-bert-v2",
                "jina-bert-v3", "eurobert", "t5encoder", "wavtokenizer-dec", "gemma-embedding", "llama-embed",
                "pangu-embedded", "qwen3tts", "pockettts", "eagle3", "dflash", "gemma4-assistant"}
NOM_EXCLU = re.compile(r"(?i)embed|rerank|dflash|draft|eagle|tts|-mtp\b|mmproj|audio|voxtral|whisper|asr|speech|encoder|colbert|models-moved")
QUANTS = ("Q4_K_M", "Q4_0", "Q8_0")
PAUSE = 1.0  # secondes entre deux appels a Hugging Face (limite de debit : erreurs 429)


def archs_supportees():
    """Architectures connues du llama.cpp embarque (None si node_modules absent)."""
    if not ARCH_SRC.exists():
        return None
    return set(re.findall(r'\{\s*LLM_ARCH_[A-Z0-9_]+,\s*"([^"]+)"', ARCH_SRC.read_text(encoding="utf-8")))


def get(url, **kw):
    time.sleep(PAUSE)
    r = requests.get(url, timeout=60, **kw)
    if r.status_code == 429:  # limite de debit : une pause longue, un seul nouvel essai
        time.sleep(60)
        r = requests.get(url, timeout=60, **kw)
    r.raise_for_status()
    return r.json()


def lister(editeur):
    return get(HF_API, params=[("author", editeur), ("filter", "gguf"), ("sort", "lastModified"),
                                     ("direction", "-1"), ("limit", 200)]
                     + [("expand[]", k) for k in ("gguf", "gated", "tags", "downloads", "lastModified",
                                                  "pipeline_tag", "createdAt")])


def tailles(repo):
    """{quant: (fichier, octets)} pour les quantifications suivies (fichiers non decoupes)."""
    out = {}
    for f in get(f"{HF_API}/{repo}/tree/main", params={"recursive": "1"}):
        p = f.get("path", "")
        # ni projecteur vision, ni tete MTP, ni tokenizer audio, ni fichier decoupe
        if not p.lower().endswith(".gguf") or re.search(r"(?i)mmproj|mtp|tokenizer", p) or re.search(r"-\d{5}-of-\d{5}", p):
            continue
        for q in QUANTS:
            if re.search(rf"(?i)[-_.]{q}[-_.]", p) and (q not in out or f["size"] < out[q][1]):
                out[q] = (p, f["size"])
    return out


def base_model(m):
    tags = m.get("tags", [])
    b = next((t.split(":", 2)[2] for t in tags if t.startswith("base_model:quantized:")), None) \
        or next((t.split(":", 1)[1] for t in tags if t.startswith("base_model:") and t.count(":") == 1), None)
    return b or m["id"]


def suivre_regles(today):
    """Telecharge les regles PocketPal publiees ; journalise une nouvelle version."""
    try:
        r = requests.get(RULES_URL, timeout=60)
        r.raise_for_status()
        new = r.json()
    except Exception as e:
        print(f"regles PocketPal injoignables ({e})", file=sys.stderr)
        return
    old = json.loads(RULES_PATH.read_text(encoding="utf-8")) if RULES_PATH.exists() else None
    RULES_PATH.write_text(json.dumps(new, ensure_ascii=False, indent=1), encoding="utf-8")
    if old and old.get("rules_version") != new.get("rules_version"):
        lignes = [f"Regles PocketPal : {old.get('rules_version')} -> {new.get('rules_version')} ({today})"]
        for t, v in new.get("tiers", {}).items():
            avant = {c["model"] for c in old.get("tiers", {}).get(t, {}).get("candidates", [])}
            apres = {c["model"] for c in v.get("candidates", [])}
            if avant != apres:
                lignes.append(f"  {t} : + {sorted(apres - avant)}  - {sorted(avant - apres)}")
        (HISTORY_DIR / f"regles_{today}.log").write_text("\n".join(lignes) + "\n", encoding="utf-8")
        print("\n".join(lignes), file=sys.stderr)


def version_appli():
    m = re.search(r'versionName "([0-9.]+)"', GRADLE.read_text(encoding="utf-8")) if GRADLE.exists() else None
    return m.group(1) if m else None


def depuis_version(archs):
    """{architecture: 1re version de l'appli qui la lit}, en ajoutant la version
    actuelle a l'historique la premiere fois qu'elle est vue."""
    hist = json.loads(ARCHS_VERSIONS_PATH.read_text(encoding="utf-8")) if ARCHS_VERSIONS_PATH.exists() else {}
    v = version_appli()
    if archs is not None and v:
        if v not in hist:
            hist[v] = sorted(archs)
            ARCHS_VERSIONS_PATH.write_text(json.dumps(hist, indent=1), encoding="utf-8")
        elif set(hist[v]) != archs:
            print(f"moteur change sans changer versionName ({v}) : monter la version", file=sys.stderr)
    depuis = {}
    for ver in sorted(hist, key=lambda x: tuple(int(n) for n in x.split("."))):
        for a in hist[ver]:
            depuis.setdefault(a, ver)
    return depuis


def main():
    HISTORY_DIR.mkdir(exist_ok=True)
    today = datetime.date.today().isoformat()
    etat = json.loads(STATE_PATH.read_text(encoding="utf-8")) if STATE_PATH.exists() else {}
    premier = not etat
    archs = archs_supportees()
    if archs is None:
        print("llama-arch.cpp introuvable : compatibilite non verifiee", file=sys.stderr)

    for editeur in EDITEURS:
        try:
            models = lister(editeur)
        except Exception as e:
            print(f"{editeur} : erreur ({e})", file=sys.stderr)
            continue
        for m in models:
            g = m.get("gguf") or {}
            total, arch = g.get("total") or 0, g.get("architecture") or ""
            if m.get("gated") or not total or total > MAX_PARAMS or arch in ARCH_EXCLUES or NOM_EXCLU.search(m["id"]):
                continue
            e = etat.get(m["id"], {})
            # tailles relues si le depot a change ; un echec est retente au passage suivant
            if e.get("tailles_du") != m.get("lastModified"):
                try:
                    e["tailles"] = tailles(m["id"])
                    e["tailles_du"] = m.get("lastModified")
                except Exception as ex:
                    print(f"{m['id']} : tailles illisibles ({ex})", file=sys.stderr)
                    e.setdefault("tailles", {})
            tags = m.get("tags", [])
            e.update(editeur=editeur, base_model=base_model(m), architecture=arch, params=total,
                     context=g.get("context_length"), downloads=m.get("downloads", 0),
                     lastModified=m.get("lastModified"), createdAt=(m.get("createdAt") or "")[:10],
                     license=next((t.split(":", 1)[1] for t in tags if t.startswith("license:")), ""),
                     vision="image-text-to-text" == m.get("pipeline_tag"))
            e.setdefault("vu_le", today)
            etat[m["id"]] = e

    # nouveautes par modele de base (un meme modele sort chez plusieurs editeurs)
    bases_avant = {e["base_model"] for i, e in etat.items() if e["vu_le"] < today}
    nouveaux = {}
    for i, e in etat.items():
        if e["vu_le"] == today and e["base_model"] not in bases_avant:
            nouveaux.setdefault(e["base_model"], []).append(i)

    depuis = depuis_version(archs)
    for i, e in etat.items():
        e["supporte"] = None if archs is None else e["architecture"] in archs
        e["depuis_version"] = depuis.get(e["architecture"])
    STATE_PATH.write_text(json.dumps(etat, ensure_ascii=False, indent=1), encoding="utf-8")

    champs = ["id", "editeur", "base_model", "architecture", "supporte", "params_b", "vision", "context",
              "license", "downloads", "createdAt"] + [f"{q.lower()}_{x}" for q in QUANTS for x in ("fichier", "go")]
    with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=champs)
        w.writeheader()
        for i, e in sorted(etat.items(), key=lambda x: x[1]["base_model"].lower()):
            row = {"id": i, "params_b": round(e["params"] / 1e9, 2),
                   **{k: e.get(k) for k in champs if k in e}}
            for q in QUANTS:
                if q in e.get("tailles", {}):
                    row[f"{q.lower()}_fichier"], octets = e["tailles"][q]
                    row[f"{q.lower()}_go"] = round(octets / 1e9, 2)
            w.writerow(row)

    suivre_regles(today)

    n_bases = len({e["base_model"] for e in etat.values()})
    if nouveaux and not premier:
        log_path = HISTORY_DIR / f"nouveautes_{today}.log"
        with open(log_path, "w", encoding="utf-8") as f:
            f.write(f"{len(nouveaux)} nouveau(x) modele(s) GGUF detecte(s) le {today}\n\n")
            for b, ids in sorted(nouveaux.items(), key=lambda x: -max(etat[i]["downloads"] for i in x[1])):
                e = etat[ids[0]]
                sup = {True: "supporte", False: "PAS supporte par le llama.cpp de l'appli", None: "?"}[e["supporte"]]
                f.write(f"{b}\n  {e['params'] / 1e9:.1f} Md param., archi {e['architecture']} ({sup}), "
                        f"licence={e['license']}, {'vision, ' if e['vision'] else ''}depots : {', '.join(ids)}\n")
        print(f"OK : {len(etat)} depots, {n_bases} modeles, {len(nouveaux)} nouveautes -> {log_path}", file=sys.stderr)
    else:
        print(f"OK : {len(etat)} depots, {n_bases} modeles" + (" (premier passage)" if premier else ", aucune nouveaute"),
              file=sys.stderr)


if __name__ == "__main__":
    main()
