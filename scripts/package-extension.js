#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 项目根目录和扩展目录
const rootDir = path.resolve(__dirname, '..');
const extensionDir = path.join(rootDir, 'chrome-extension');
const outputDir = path.join(rootDir, 'dist');

// 输出文件名（带时间戳）
const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
const outputFileName = `synapse-extension-${timestamp}.zip`;
const outputPath = path.join(outputDir, outputFileName);

// 需要包含的文件和目录
const includePaths = [
  'manifest.json',
  'dist',
  'icons',
  'popup',
  'options',
  'logs'
];

// 需要排除的文件模式（TypeScript 源文件不需要在最终包中）
const excludePatterns = [
  '**/*.ts',
  '**/*.map'
];

// 确保输出目录存在
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log('📦 Starting Chrome extension packaging...\n');
console.log(`📂 Extension directory: ${extensionDir}`);
console.log(`📤 Output file: ${outputPath}\n`);

// 创建 zip 文件
const output = fs.createWriteStream(outputPath);
const archive = archiver('zip', {
  zlib: { level: 9 } // 最高压缩级别
});

// 监听事件
output.on('close', () => {
  const sizeInMB = (archive.pointer() / 1024 / 1024).toFixed(2);
  console.log(`\n✅ Package created successfully!`);
  console.log(`📦 File: ${outputFileName}`);
  console.log(`📊 Size: ${sizeInMB} MB (${archive.pointer()} bytes)`);
  console.log(`📍 Location: ${outputPath}`);
});

archive.on('error', (err) => {
  console.error('❌ Error creating package:', err);
  process.exit(1);
});

archive.on('warning', (err) => {
  if (err.code === 'ENOENT') {
    console.warn('⚠️  Warning:', err.message);
  } else {
    console.error('❌ Error:', err);
    process.exit(1);
  }
});

// 输出进度
let fileCount = 0;
archive.on('entry', (entry) => {
  fileCount++;
  if (fileCount % 10 === 0) {
    process.stdout.write(`\r📄 Added ${fileCount} files...`);
  }
});

// 将 archive 连接到文件输出流
archive.pipe(output);

// 添加文件和目录
console.log('📋 Including the following paths:');
for (const includePath of includePaths) {
  const fullPath = path.join(extensionDir, includePath);

  if (!fs.existsSync(fullPath)) {
    console.warn(`⚠️  Warning: ${includePath} not found, skipping...`);
    continue;
  }

  const stats = fs.statSync(fullPath);

  if (stats.isDirectory()) {
    console.log(`  ✓ ${includePath}/ (directory)`);
    // 使用 glob 方法添加目录，排除 .ts 和 .map 文件
    archive.glob('**/*', {
      cwd: fullPath,
      ignore: excludePatterns
    }, {
      prefix: includePath
    });
  } else {
    console.log(`  ✓ ${includePath} (file)`);
    archive.file(fullPath, { name: includePath });
  }
}

console.log('\n🔄 Compressing files...');

// 完成打包
archive.finalize();
