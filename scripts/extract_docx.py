import zipfile
import xml.etree.ElementTree as ET

with zipfile.ZipFile(r'c:\Users\Cash4\OneDrive\Desktop\trinity-ecosystem\trinity-ecosystem\docs\HyperDAG_Patent_Claims_Artifact1.docx') as docx:
    text = '\n'.join(e.text for e in ET.fromstring(docx.read('word/document.xml')).iter() if e.tag.endswith('}t') and e.text)

with open(r'c:\Users\Cash4\OneDrive\Desktop\trinity-ecosystem\trinity-ecosystem\docs\hyperdag_text.txt', 'w', encoding='utf-8') as f:
    f.write(text)
