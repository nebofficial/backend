const ftp = require('basic-ftp');
const path = require('path');
const fs = require('fs');
const os = require('os');

const FTP_CONFIG = {
    host: "ftp.shyamsironlineacademy.com",
    user: "resourse@document.shyamsironlineacademy.com",
    password: "ftp.shyamsironlineacademy.com", // set this in .env
    port: 21
};

async function uploadFileToFTP(localFilePath, remoteName) {
    const client = new ftp.Client();
    client.ftp.verbose = true; // Enable verbose logging
    
    try {
        await client.access(FTP_CONFIG);
        
        // Set transfer mode to binary
        await client.send('TYPE I');
        
        // Ensure base upload directory exists
        const basePath = '/';
        const fullPath = path.join(basePath, remoteName).replace(/\\/g, '/');
        const uploadDir = path.dirname(fullPath);
        
        // Create directory structure
        try {
            await client.ensureDir(uploadDir);
        } catch (err) {
            console.log('Creating directory structure:', uploadDir);
            const parts = uploadDir.split('/').filter(Boolean);
            let currentPath = '';
            
            for (const part of parts) {
                currentPath += '/' + part;
                try {
                    await client.send('MKD ' + currentPath);
                } catch (mkdErr) {
                    // Directory might already exist, continue
                    console.log('Directory exists or error:', mkdErr.message);
                }
                await client.cd(currentPath);
            }
        }
        
        // Upload the file
        console.log('Uploading to:', fullPath);
        await client.uploadFrom(localFilePath, fullPath);
        
        // Return the public URL
        const publicPath = remoteName.replace(/\\/g, '/');
        const url = `https://document.shyamsironlineacademy.com/resourse/${publicPath}`;
        return url;
    } catch (err) {
        console.error('FTP upload error:', err);
        throw new Error('Failed to upload file');
    } finally {
        client.close();
    }
}

async function uploadBase64ToFTP(base64Data, filename) {
    // Strip base64 header if present
    const base64Image = base64Data.replace(/^data:image\/\w+;base64,/, '');
    
    // Create temp file
    const tempPath = path.join(os.tmpdir(), filename);
    await fs.promises.writeFile(tempPath, base64Image, 'base64');
    
    try {
        const url = await uploadFileToFTP(tempPath, filename);
        return url;
    } finally {
        // Clean up temp file
        await fs.promises.unlink(tempPath).catch(console.error);
    }
}

module.exports = { uploadFileToFTP, uploadBase64ToFTP };
