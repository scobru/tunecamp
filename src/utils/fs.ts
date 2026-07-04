import fsOriginal from 'fs';
import { promisify } from 'util';
import * as path from 'path';

export const promises = fsOriginal.promises;

// fs-extra async methods (promise-based)
export const pathExists = async (p: string) => {
    try {
        await fsOriginal.promises.access(p);
        return true;
    } catch {
        return false;
    }
};

export const ensureDir = async (p: string) => {
    await fsOriginal.promises.mkdir(p, { recursive: true });
};

export const remove = async (p: string) => {
    await fsOriginal.promises.rm(p, { recursive: true, force: true });
};

export const copy = async (src: string, dest: string, options?: any) => {
    await fsOriginal.promises.cp(src, dest, { recursive: true, force: options?.overwrite !== false });
};

export const move = async (src: string, dest: string, options?: { overwrite?: boolean }) => {
    const overwrite = options?.overwrite ?? false;
    if (!overwrite && await pathExists(dest)) {
        const err = new Error(`dest already exists: ${dest}`);
        (err as any).code = 'EEXIST';
        throw err;
    }
    await ensureDir(path.dirname(dest));
    try {
        await fsOriginal.promises.rename(src, dest);
    } catch (err: any) {
        if (err.code === 'EXDEV') {
            await copy(src, dest, options);
            await remove(src);
        } else {
            throw err;
        }
    }
};

export const readJson = async (p: string) => {
    const content = await fsOriginal.promises.readFile(p, 'utf-8');
    return JSON.parse(content);
};

export const writeJson = async (p: string, data: any, options?: { spaces?: number }) => {
    const spaces = options?.spaces ?? 2;
    await fsOriginal.promises.writeFile(p, JSON.stringify(data, null, spaces), 'utf-8');
};

export const emptyDir = async (dir: string) => {
    try {
        const items = await fsOriginal.promises.readdir(dir);
        await Promise.all(items.map(item => remove(path.join(dir, item))));
    } catch {
        await ensureDir(dir);
    }
};

// fs-extra sync methods
export const removeSync = (p: string) => {
    fsOriginal.rmSync(p, { recursive: true, force: true });
};

export const moveSync = (src: string, dest: string, options?: any) => {
    const overwrite = options?.overwrite ?? false;
    if (!overwrite && fsOriginal.existsSync(dest)) {
        const err = new Error(`dest already exists: ${dest}`);
        (err as any).code = 'EEXIST';
        throw err;
    }
    ensureDirSync(path.dirname(dest));
    try {
        fsOriginal.renameSync(src, dest);
    } catch (err: any) {
        if (err.code === 'EXDEV') {
            fsOriginal.cpSync(src, dest, { recursive: true, force: options?.overwrite !== false });
            fsOriginal.rmSync(src, { recursive: true, force: true });
        } else {
            throw err;
        }
    }
};

export const ensureDirSync = (p: string) => {
    fsOriginal.mkdirSync(p, { recursive: true });
};

export const copySync = (src: string, dest: string, options?: any) => {
    fsOriginal.cpSync(src, dest, { recursive: true, force: options?.overwrite !== false });
};

// Async re-exports (promise-based via promisify or promises)
export const readFile = fsOriginal.promises.readFile;
export const writeFile = fsOriginal.promises.writeFile;
export const readdir = fsOriginal.promises.readdir;
export const stat = fsOriginal.promises.stat;
export const rename = fsOriginal.promises.rename;
export const mkdir = fsOriginal.promises.mkdir;
export const rmdir = fsOriginal.promises.rmdir;
export const unlink = fsOriginal.promises.unlink;
export const access = fsOriginal.promises.access;
export const rm = fsOriginal.promises.rm;
export const mkdtemp = fsOriginal.promises.mkdtemp;

// Promisified versions of descriptor-based methods
export const open = promisify(fsOriginal.open);
export const read = promisify(fsOriginal.read);
export const write = promisify(fsOriginal.write);
export const close = promisify(fsOriginal.close);

// Re-export sync methods, streams, and classes from native fs (no duplicates with above)
export const {
    accessSync,
    appendFile,
    appendFileSync,
    chmod,
    chmodSync,
    chown,
    chownSync,
    closeSync,
    copyFile,
    copyFileSync,
    createReadStream,
    createWriteStream,
    exists,
    existsSync,
    fchmod,
    fchmodSync,
    fchown,
    fchownSync,
    fdatasync,
    fdatasyncSync,
    fstat,
    fstatSync,
    fsync,
    fsyncSync,
    ftruncate,
    ftruncateSync,
    futimes,
    futimesSync,
    lchmod,
    lchmodSync,
    lchown,
    lchownSync,
    link,
    linkSync,
    lstat,
    lstatSync,
    lutimes,
    lutimesSync,
    mkdirSync,
    mkdtempSync,
    openSync,
    opendir,
    opendirSync,
    readSync,
    readdirSync,
    readFileSync,
    readlink,
    readlinkSync,
    realpath,
    realpathSync,
    renameSync,
    rmSync,
    rmdirSync,
    statSync,
    symlink,
    symlinkSync,
    truncate,
    truncateSync,
    unlinkSync,
    utimes,
    utimesSync,
    writeSync,
    writeFileSync,
    writev,
    writevSync,
    Dir,
    Dirent,
    ReadStream,
    WriteStream,
    Stats
} = fsOriginal;

const fsExtra = {
    promises,
    pathExists,
    ensureDir,
    remove,
    copy,
    move,
    readJson,
    writeJson,
    emptyDir,
    removeSync,
    moveSync,
    ensureDirSync,
    copySync,
    readFile,
    writeFile,
    readdir,
    stat,
    rename,
    mkdir,
    rmdir,
    unlink,
    access,
    open,
    read,
    write,
    close,
    rm,
    mkdtemp,
    accessSync,
    appendFile,
    appendFileSync,
    chmod,
    chmodSync,
    chown,
    chownSync,
    closeSync,
    copyFile,
    copyFileSync,
    createReadStream,
    createWriteStream,
    exists,
    existsSync,
    fchmod,
    fchmodSync,
    fchown,
    fchownSync,
    fdatasync,
    fdatasyncSync,
    fstat,
    fstatSync,
    fsync,
    fsyncSync,
    ftruncate,
    ftruncateSync,
    futimes,
    futimesSync,
    lchmod,
    lchmodSync,
    lchown,
    lchownSync,
    link,
    linkSync,
    lstat,
    lstatSync,
    lutimes,
    lutimesSync,
    mkdirSync,
    mkdtempSync,
    openSync,
    opendir,
    opendirSync,
    readSync,
    readdirSync,
    readFileSync,
    readlink,
    readlinkSync,
    realpath,
    realpathSync,
    renameSync,
    rmSync,
    rmdirSync,
    statSync,
    symlink,
    symlinkSync,
    truncate,
    truncateSync,
    unlinkSync,
    utimes,
    utimesSync,
    writeSync,
    writeFileSync,
    writev,
    writevSync,
    Dir,
    Dirent,
    ReadStream,
    WriteStream,
    Stats
};

export default fsExtra;
