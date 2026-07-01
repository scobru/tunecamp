import { StringUtils } from './stringUtils.js';

export const LibraryUtils = {
    /**
     * Formats an audio filename: "01 - Title.mp3"
     */
    formatAudioFilename: (
        trackNum: number,
        title: string,
        extension: string
    ): string => {
        let numStr = "";
        if (trackNum > 0) {
            numStr = trackNum.toString().padStart(2, "0") + "-";
        }

        const ext = StringUtils.getFileExtension(`file.${extension}`);
        return numStr + StringUtils.slugify(title) + "." + (ext || extension.toLowerCase().replace(/^\./, ''));
    },

    /**
     * Formats an album directory: "Artist - Album"
     * Actually Gleam implementation was: string_utils.slugify(artist) <> "/" <> string_utils.slugify(album)
     * It seems to create a path?
     */
    formatAlbumDirectory: (artist: string, album: string): string => {
        return StringUtils.slugify(artist) + "/" + StringUtils.slugify(album);
    },

    /**
     * Returns the standard cover filename: "cover.jpg" or "cover.png"
     */
    getStandardCoverFilename: (originalExt: string): string => {
        const normalizedExt = originalExt.toLowerCase().startsWith('.') ? originalExt.slice(1) : originalExt;
        if (normalizedExt.toLowerCase() === "png") {
            return "cover.png";
        }
        return "cover.jpg";
    }
};
