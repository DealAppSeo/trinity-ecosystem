
import zipfile
import xml.etree.ElementTree as ET
import io
import os

docx_path = 'c:/Users/Cash4/OneDrive/Desktop/trinity-ecosystem/trinity-ecosystem/docs/database/Trinity_ThreeAI_MasterSynthesis_v1.docx'
output_path = 'c:/Users/Cash4/.gemini/antigravity/brain/9778fa0f-a293-4c40-9d30-6d128afe5cc1/extracted_docs/MasterSynthesis_v1.txt'

def extract_text(path):
    if not os.path.exists(path):
        return f"Error: File not found at {path}"
    try:
        z = zipfile.ZipFile(path)
        xml_content = z.read('word/document.xml')
        root = ET.fromstring(xml_content)
        namespace = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        text = []
        for t in root.findall('.//w:t', namespace):
            if t.text:
                text.append(t.text)
        
        for name in z.namelist():
            if name.startswith('word/header') or name.startswith('word/footer'):
                xml_content = z.read(name)
                root = ET.fromstring(xml_content)
                for t in root.findall('.//w:t', namespace):
                    if t.text:
                        text.append(t.text)
                        
        return '\n'.join(text)
    except Exception as e:
        return f"Error extracting: {str(e)}"

os.makedirs(os.path.dirname(output_path), exist_ok=True)
content = extract_text(docx_path)
with io.open(output_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Finished extraction to " + output_path)
