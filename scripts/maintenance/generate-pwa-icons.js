const sharp = require('sharp');
const path = require('path');

async function generateIcons() {
    const sourcePath = path.join(process.cwd(), 'public', 'trinity-symphony.png');
    const sizes = [192, 512];

    for (const size of sizes) {
        await sharp(sourcePath)
            .resize(size, size)
            .toFile(path.join(process.cwd(), 'public', `icon-${size}.png`));
        console.log(`Generated icon-${size}.png`);
    }
}

generateIcons().catch(console.error);
