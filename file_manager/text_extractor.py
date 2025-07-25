import pymupdf

def generate_plaintext(file_paths: list[str]) -> str:
    combined_text = []
    for path in file_paths:
        if path.lower().endswith('.pdf'):
            text = extract_pdf(path)
            combined_text.append(f"--- {path} ---\n{text}")
        else:
            continue
    return "\n\n".join(combined_text)

def extract_pdf(file_path: str) -> str:
    text = []
    with pymupdf.open(file_path) as doc:
        for page in doc:
            page_text = page.get_text("text")
            text.append(page_text.strip())

    return "\n\n".join(text)