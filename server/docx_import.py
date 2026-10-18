"""Transforma um .docx de receita em campos do livro, separando as seções pelos títulos."""
import re
import unicodedata
from io import BytesIO
from pathlib import Path

from docx import Document
from docx.table import Table

# Comparado com o texto sem acento e em minúsculas.
SECTIONS = {
    "ingredients": r"ingredientes?\b",
    "steps": r"(modo de (preparo|fazer)|como fazer|preparo|preparacao)\b",
    "notes": r"(observac(ao|oes)|obs|dicas?)\b",
}
HEADING_MAX = 40  # linhas maiores que isso são texto, mesmo começando com "Obs..."


def _norm(text):
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower().strip(" :.-\t")


def _heading(text):
    """('steps', resto_da_linha) se a linha abre uma seção, senão None."""
    n = _norm(text)
    if len(n) > HEADING_MAX:
        return None
    for key, pat in SECTIONS.items():
        m = re.match(pat, n)
        if m:
            return key, text.strip() if n[m.end():].strip(" :.-") else ""
    return None


def _lines(doc):
    for block in doc.iter_inner_content():
        if isinstance(block, Table):
            for row in block.rows:
                yield " ".join(c.text.strip() for c in row.cells if c.text.strip())
        else:
            yield block.text


def _first_image(doc):
    for rel in doc.part.rels.values():
        if "image" in rel.reltype and not rel.is_external:
            return rel.target_part.blob
    return None


def parse(data, filename="receita.docx"):
    """Devolve (campos, bytes_da_primeira_imagem_ou_None)."""
    doc = Document(BytesIO(data))
    title, current = None, "notes"  # texto antes da 1ª seção (ex.: "Rende 10 porções") vira observação
    parts = {k: [] for k in SECTIONS}
    for line in _lines(doc):
        line = line.strip()
        if not line:
            continue
        if title is None:
            title = line
            continue
        h = _heading(line)
        if h:
            current, extra = h
            if extra:  # "Ingredientes da cobertura" troca a seção e continua como subtítulo
                parts[current].append(extra)
        else:
            parts[current].append(line)
    fields = {k: "\n".join(v) for k, v in parts.items()}
    fields["title"] = title or Path(filename).stem
    return fields, _first_image(doc)
