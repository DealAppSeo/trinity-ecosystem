
import zipfile
import xml.etree.ElementTree as ET
import io
import os

docs_dir = 'c:/Users/Cash4/OneDrive/Desktop/trinity-ecosystem/trinity-ecosystem/docs/database'
output_dir = 'c:/Users/Cash4/.gemini/antigravity/brain/9778fa0f-a293-4c40-9d30-6d128afe5cc1/extracted_docs'

if not os.path.exists(output_dir):
    os.makedirs(output_dir)

def extract_text(path):
    try:
        z = zipfile.ZipFile(path)
        namespace = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        text = []
        
        # document.xml
        if 'word/document.xml' in z.namelist():
            xml_content = z.read('word/document.xml')
            root = ET.fromstring(xml_content)
            for t in root.findall('.//w:t', namespace):
                if t.text: text.append(t.text)
        
        # headers and footers
        for name in z.namelist():
            if name.startswith('word/header') or name.startswith('word/footer'):
                xml_content = z.read(name)
                root = ET.fromstring(xml_content)
                for t in root.findall('.//w:t', namespace):
                    if t.text: text.append(t.text)
                            
        return '\n'.join(text)
    except Exception as e:
        return f"Error: {str(e)}"

docx_files = [f for f in os.listdir(docs_dir) if f.endswith('.docx')]

for f in docx_files:
    print(f"Extracting {f}...")
    content = extract_text(os.path.join(docs_dir, f))
    out_name = f.replace('.docx', '.txt')
    with io.open(os.path.join(output_dir, out_name), 'w', encoding='utf-8') as out_file:
        out_file.write(content)

print("Batch extraction complete.")
