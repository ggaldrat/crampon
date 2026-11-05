#!/usr/bin/env python3
"""Recalcule recommendations.csv pour Crampon (fork de PocketPal, llama.cpp).

Depuis le 31 oct. 2026 (choix de pocketpal-ai comme base, version LiteRT-LM
archivee dans archive-litert/) :

1. Base : les regles PocketPal publiees (pocketpal-device-rules, telechargees
   par l'appli et par refresh_hf_catalogue.py). Elles classent l'appareil en
   gamme low / mid / high / flagship et donnent, par gamme, des modeles mesures
   sur de vrais telephones (memoire, debit). On les reprend telles quelles.
2. Pistes : modeles GGUF de la veille (hf_gguf_catalogue) supportes par le
   llama.cpp de l'appli mais absents des regles, ranges dans la gamme la plus
   basse dont la RAM les accepte (memoire ESTIMEE, pas mesuree), classes par
   score Artificial Analysis (mobile_benchmark.csv), les pistes de plus de
   LENT_S secondes sur Galaxy S26 Ultra passant apres les autres, puis par date.
3. modeles_compatibilite.csv (a la main) : un "echec" avec le moteur llama.cpp
   exclut un modele ; "confirme" est indique.
4. Regles publiees pour l'appli (web/rules/rules.android.v2.json, lu par
   rulesUrls.ts) : les regles PocketPal, plus les pistes validees sur telephone,
   soit par un essai "confirme", soit (choix du 1er nov. 2026, pas d'essais faits
   a la main) par une mesure Artificial Analysis sur Galaxy S26 Ultra avec
   llama.cpp, en LENT_S secondes au plus. Le premier modele de la gamme est celui
   que l'accueil de l'appli installe.

Usage: python3 compute_recommendations.py
Lance quotidiennement via le meme timer que les deux scripts de refresh."""
import csv
import hashlib
import json
import re
import sys
import os
from pathlib import Path

# Scripts in the app repo (veille/), data in the directory named by
# CRAMPON_VEILLE_DATA (the veille-data branch on GitHub), here by default.
ROOT = Path(os.environ.get("CRAMPON_VEILLE_DATA", Path(__file__).parent))
APP = Path(__file__).parent.parent
STATE_PATH = ROOT / "hf_gguf_history" / "catalogue.json"
RULES_PATH = ROOT / "hf_gguf_history" / "rules.android.v2.json"
BUNDLED_RULES = APP / "src/store/bundledDeviceRules/rules.android.json"
BENCHMARK_CSV = ROOT / "mobile_benchmark.csv"
COMPAT_CSV = ROOT / "modeles_compatibilite.csv"
ONBOARDING = APP / "src/store/onboarding/onboardingPals.ts"
OUT_CSV = ROOT / "recommendations.csv"
RULES_OUT = ROOT / "rules" / "rules.android.v2.json"
# tete de chaque gamme publiee, et nouvelle tete en attente (voir stabiliser_tetes)
TETES_PATH = ROOT / "hf_gguf_history" / "tetes_publiees.json"
TETE_RUNS = 2

# RAM minimale de l'appareil par gamme (bas de la bande ram_band des regles) ;
# Android tue l'appli au-dela d'environ 65 % de la RAM (os_killer_margin des regles)
GAMMES = {"low": 4, "mid": 6, "high": 6, "flagship": 12}
PART_UTILE = 0.65
PISTES_PAR_GAMME = 8
# une piste doit venir d'un laboratoire connu ou etre deja adoptee : sinon, les
# convertisseurs (bartowski, unsloth) remontent des fine-tunes d'inconnus
LABOS = {"qwen", "liquidai", "google", "ibm-granite", "microsoft", "mistralai", "huggingfacetb", "allenai", "nvidia",
         "deepseek-ai", "openbmb", "tiiuae", "prism-ml", "meta-llama", "inclusionai", "nanbeige", "xhtoken",
         "openai", "baidu", "tencent", "zai-org", "moonshotai", "stepfun-ai", "ai21labs", "cohereforai", "ai9stars"}
MIN_DL = 20000
# au-dela, la reponse type d'AA (invite 1 024 tokens, reponse 256) est trop lente sur Android
LENT_S = 30


def normalize(name):
    """Identifiant comparable entre regles, depots GGUF et benchmark."""
    n = name.split("/")[-1].lower()
    n = re.sub(r"-gguf$|gguf|-instruct|-it\b|\(reasoning\)|\(non-reasoning\)|reasoning|-chat\b", "", n)
    return re.sub(r"[^a-z0-9]", "", n)


def ram_estimee(go):
    """RAM occupee estimee a partir de la taille du fichier (calee sur les min_ram_gb des regles)."""
    return round(go * 1.3 + 0.7, 1)


def charger_compat():
    if not COMPAT_CSV.exists():
        return {}
    with open(COMPAT_CSV, encoding="utf-8") as f:
        return {normalize(r["model"]): r for r in csv.DictReader(f) if r.get("moteur", "llama.cpp") == "llama.cpp"}


def charger_scores():
    """{modele: (score 16K, secondes sur Galaxy S26 Ultra ou "")} ; meilleur mode
    (avec ou sans raisonnement) quand AA teste les deux."""
    if not BENCHMARK_CSV.exists():
        return {}
    out = {}
    with open(BENCHMARK_CSV, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if not r.get("score_16k"):
                continue
            n, sc = normalize(r["model"]), int(float(r["score_16k"]))
            if n not in out or sc > out[n][0]:
                out[n] = (sc, float(r["s26_e2e_s"]) if r.get("s26_e2e_s") else "")
    return out


def cle_modele(c):
    return f"{c.get('hf_repo')}/{c.get('hf_filename')}"


def stabiliser_tetes(out):
    """L'appli met a jour le modele installe quand la tete de sa gamme change
    (choix du 2 nov. 2026) : une nouvelle tete n'est publiee qu'apres TETE_RUNS
    calculs de suite, pour qu'une variation de score ne fasse pas telecharger
    1 Go a chaque telephone. En attendant, l'ancienne tete reste premiere."""
    etat = json.loads(TETES_PATH.read_text(encoding="utf-8")) if TETES_PATH.exists() else {}
    if not etat and RULES_OUT.exists():
        # premier passage : la tete deja publiee fait foi
        avant = json.loads(RULES_OUT.read_text(encoding="utf-8"))
        etat = {g: {"publie": cle_modele(t["candidates"][0])}
                for g, t in avant.get("tiers", {}).items() if t.get("candidates")}
    for g, tier in out.get("tiers", {}).items():
        cands = tier.get("candidates", [])
        if not cands:
            continue
        tete = cle_modele(cands[0])
        e = etat.setdefault(g, {"publie": tete})
        publie = next((c for c in cands if cle_modele(c) == e["publie"]), None)
        if tete == e["publie"] or publie is None:
            # tete inchangee, ou l'ancienne a disparu des regles : rien a attendre
            etat[g] = {"publie": tete}
            continue
        vu = e.get("vu", 0) + 1 if e.get("candidat") == tete else 1
        if vu >= TETE_RUNS:
            print(f"{g} : nouvelle tete publiee {tete} (avant {e['publie']})", file=sys.stderr)
            etat[g] = {"publie": tete}
        else:
            print(f"{g} : tete {tete} en attente ({vu}/{TETE_RUNS}), {e['publie']} reste en tete", file=sys.stderr)
            etat[g] = {"publie": e["publie"], "candidat": tete, "vu": vu}
            tier["candidates"] = [publie] + [c for c in cands if c is not publie]
    TETES_PATH.write_text(json.dumps(etat, ensure_ascii=False, indent=1), encoding="utf-8")


def publier_regles(regles, confirmes, scores):
    """Ecrit les regles de l'appli : PocketPal + pistes validees. Une piste passe en
    tete d'une gamme si elle y bat le meilleur score AA deja present (ou, testee a
    la main sans score, dans sa propre gamme) ; sinon elle s'ajoute a la fin de sa propre gamme seulement."""
    out = json.loads(json.dumps(regles))
    ordre = [g for g, _ in sorted(GAMMES.items(), key=lambda x: x[1])]
    confirmes.sort(key=lambda c: -(c["score"] or 0))
    for g in out.get("tiers", {}):
        anciens = out["tiers"][g].get("candidates", [])
        meilleur = max([scores[n][0] for c in anciens for n in (normalize(c.get("hf_repo") or c["model"]),
                                                                 normalize(c["model"])) if n in scores] or [0])
        dessous = ordre[:ordre.index(g) + 1] if g in ordre else []
        neufs = [c for c in confirmes if c["gamme"] in dessous]
        tete = [c["regle"] for c in neufs if (c["score"] or 0) > meilleur or (c["score"] == "" and c["gamme"] == g)]
        # en fin de liste : seulement les pistes de cette gamme (pas les petits modeles d'en dessous)
        fin = [c["regle"] for c in neufs if c["regle"] not in tete and c["gamme"] == g]
        cles = {(n["hf_repo"], n["hf_filename"]) for n in tete + fin}
        out["tiers"][g]["candidates"] = tete + [c for c in anciens if (c.get("hf_repo"), c.get("hf_filename")) not in cles] + fin
    stabiliser_tetes(out)
    # version stable tant que la liste ajoutee ne change pas
    ajout = json.dumps(sorted((c["regle"]["hf_repo"], c["regle"]["hf_filename"], c["gamme"]) for c in confirmes))
    out["rules_version"] = f"{regles.get('rules_version')}+crampon.{hashlib.sha1(ajout.encode()).hexdigest()[:8]}"
    out["_crampon"] = ("Regles PocketPal publiees, plus les modeles valides sur telephone (essai Crampon ou mesure "
                       "Artificial Analysis sur Galaxy S26 Ultra) ; genere par doc/compute_recommendations.py")
    RULES_OUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = RULES_OUT.with_suffix(".tmp")
    tmp.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(RULES_OUT)
    return out["rules_version"]


def main():
    regles_path = RULES_PATH if RULES_PATH.exists() else BUNDLED_RULES
    regles = json.loads(regles_path.read_text(encoding="utf-8"))
    etat = json.loads(STATE_PATH.read_text(encoding="utf-8")) if STATE_PATH.exists() else {}
    compat, scores = charger_compat(), charger_scores()
    dans_appli = {normalize(r) for r in re.findall(r"repo:\s*'([^']+)'", ONBOARDING.read_text(encoding="utf-8"))} \
        if ONBOARDING.exists() else set()

    def mesure(*noms):
        sc, s26 = next((scores[n] for n in noms if n in scores), ("", ""))
        return {"score": sc, "s26_s": s26}

    def etat_compat(n):
        c = compat.get(n)
        return f"{c['compatibilite']} ({c['date']})" if c else "non teste"

    rows = []
    connus = set()
    for gamme, v in regles.get("tiers", {}).items():
        for rang, c in enumerate(v.get("candidates", []), 1):
            n = normalize(c.get("hf_repo") or c["model"])
            connus |= {n, normalize(c["model"])}
            if compat.get(n, {}).get("compatibilite") == "echec":
                continue
            rows.append({"gamme": gamme, "rang": rang, "source": "regles PocketPal " + regles.get("rules_version", ""),
                         "modele": c.get("display_name") or c["model"], "depot": c.get("hf_repo", ""),
                         "fichier": c.get("hf_filename", ""), "taille_go": round(c.get("size_bytes", 0) / 1e9, 2),
                         "ram_min_go": c.get("min_ram_gb", ""), "ram": "mesuree",
                         **mesure(n, normalize(c["model"])),
                         "dans_appli": n in dans_appli, "compatibilite": etat_compat(n)})

    # un depot par modele de base : celui de l'editeur prefere qui a un fichier Q4
    from refresh_hf_catalogue import EDITEURS
    par_base = {}
    for i, e in etat.items():
        q = e.get("tailles", {}).get("Q4_K_M") or e.get("tailles", {}).get("Q4_0")
        if not e.get("supporte") or not q:
            continue
        cle = (EDITEURS.index(e["editeur"]) if e["editeur"] in EDITEURS else 99, -e.get("downloads", 0))
        b = normalize(e["base_model"])
        if b not in par_base or cle < par_base[b][0]:
            par_base[b] = (cle, i, e, q)

    pistes = {g: [] for g in GAMMES}
    confirmes = []
    for b, (_, i, e, (fichier, octets)) in par_base.items():
        if b in connus or compat.get(b, {}).get("compatibilite") == "echec":
            continue
        ram = ram_estimee(octets / 1e9)
        gamme = next((g for g, go in sorted(GAMMES.items(), key=lambda x: x[1]) if ram <= go * PART_UTILE), None)
        sc, s26 = scores.get(b, ("", ""))
        # valide sur telephone (essai a la main, ou mesure AA sur Android) et pas trop lent
        teste = compat.get(b, {}).get("compatibilite") == "confirme"
        if gamme and (teste or s26 != "") and not (s26 != "" and s26 > LENT_S):
            confirmes.append({"gamme": gamme, "score": sc, "regle": {
                "model": b, "display_name": re.sub(r"(?i)-gguf$", "", e["base_model"].split("/")[-1]), "quant": fichier.rsplit("-", 1)[-1][:-5].lower(),
                "hf_repo": i, "hf_filename": fichier, "params": e["params"], "size_bytes": octets, "min_ram_gb": ram,
                "_source": "crampon",
                **({"min_app_version": e["depuis_version"]} if e.get("depuis_version") else {})}})
        if e["base_model"].split("/")[0].lower() not in LABOS and e.get("downloads", 0) < MIN_DL:
            continue
        if gamme:
            pistes[gamme].append({"gamme": gamme, "source": "piste veille GGUF", "modele": e["base_model"],
                                  "depot": i, "fichier": fichier, "taille_go": round(octets / 1e9, 2),
                                  "ram_min_go": ram, "ram": "estimee", **mesure(b),
                                  "dans_appli": b in dans_appli or normalize(i) in dans_appli,
                                  "compatibilite": etat_compat(b), "_dl": e.get("downloads", 0),
                                  "_cree": e.get("createdAt") or ""})
    for g, lst in pistes.items():
        # score connu et rapide d'abord, puis score connu mais lent, puis les plus
        # recents (une piste ancienne et populaire est deja connue)
        lst.sort(key=lambda r: r["_cree"], reverse=True)
        lst.sort(key=lambda r: (r["score"] == "", r["s26_s"] != "" and r["s26_s"] > LENT_S, -(r["score"] or 0)))
        for rang, r in enumerate(lst[:PISTES_PAR_GAMME], 1):
            r.pop("_dl"), r.pop("_cree")
            rows.append({**r, "rang": rang})

    champs = ["gamme", "source", "rang", "modele", "depot", "fichier", "taille_go", "ram_min_go", "ram", "score",
              "s26_s", "dans_appli", "compatibilite"]
    ordre = {g: k for k, g in enumerate(GAMMES)}
    rows.sort(key=lambda r: (ordre.get(r["gamme"], 9), r["source"].startswith("piste"), r["rang"]))
    with open(OUT_CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=champs)
        w.writeheader()
        w.writerows(rows)
    n_pistes = sum(r["source"].startswith("piste") for r in rows)
    print(f"OK : {len(rows) - n_pistes} modeles des regles PocketPal ({regles.get('rules_version')}), "
          f"{n_pistes} pistes de la veille -> {OUT_CSV}", file=sys.stderr)
    version = publier_regles(regles, confirmes, scores)
    print(f"OK : regles de l'appli {version} ({len(confirmes)} modele(s) teste(s) ajoute(s)) -> {RULES_OUT}",
          file=sys.stderr)


if __name__ == "__main__":
    main()
