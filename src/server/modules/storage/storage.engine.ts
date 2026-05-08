import fs from "fs-extra";
import type { Stats } from "fs";

export interface StorageEngine {
    pathExists(path: string): Promise<boolean>;
    readFile(path: string, encoding: string): Promise<string>;
    readFileBuffer(path: string): Promise<Buffer>;
    writeFile(path: string, content: any): Promise<void>;
    remove(path: string): Promise<void>;
    move(src: string, dest: string, options?: { overwrite?: boolean }): Promise<void>;
    ensureDir(path: string): Promise<void>;
    readdir(path: string, options?: any): Promise<any[]>;
    stat(path: string): Promise<Stats>;
    writeFileStream(path: string, stream: any): Promise<void>;
}

export class LocalDiskStorage implements StorageEngine {
    async pathExists(path: string): Promise<boolean> {
        return fs.pathExists(path);
    }

    async readFile(path: string, encoding: string): Promise<string> {
        return fs.readFile(path, encoding as any) as unknown as Promise<string>;
    }

    async readFileBuffer(path: string): Promise<Buffer> {
        return fs.readFile(path);
    }

    async writeFile(path: string, content: any): Promise<void> {
        return fs.writeFile(path, content);
    }

    async remove(path: string): Promise<void> {
        return fs.remove(path);
    }

    async move(src: string, dest: string, options?: { overwrite?: boolean }): Promise<void> {
        return fs.move(src, dest, options);
    }

    async ensureDir(path: string): Promise<void> {
        return fs.ensureDir(path);
    }

    async readdir(path: string, options?: any): Promise<any[]> {
        return fs.readdir(path, options);
    }

    async stat(path: string): Promise<Stats> {
        return fs.stat(path);
    }

    async writeFileStream(path: string, stream: any): Promise<void> {
        const writeStream = fs.createWriteStream(path);
        return new Promise((resolve, reject) => {
            stream.pipe(writeStream);
            stream.on('error', reject);
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
        });
    }
}
