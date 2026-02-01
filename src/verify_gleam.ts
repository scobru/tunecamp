import {
    formatAudioFilename,
    formatAlbumDirectory,
    getStandardCoverFilename,
    getFileExtension
} from "./utils/audioUtils.js";

async function runTests() {
    console.log("Testing Gleam-based naming logic:");

    const audioName = formatAudioFilename("Song Title", 1, ".mp3");
    console.log(`Audio: ${audioName} (expected: 01-song-title.mp3)`);

    const albumDir = formatAlbumDirectory("The Artist", "The Album");
    console.log(`Album: ${albumDir} (expected: the-artist/the-album)`);

    const coverName = getStandardCoverFilename("The Album", ".png");
    console.log(`Cover: ${coverName} (expected: the-album-cover.png)`);

    if (audioName === "01-song-title.mp3" &&
        albumDir === "the-artist/the-album" &&
        coverName === "the-album-cover.png") {
        console.log("\n✅ Verification SUCCESS");
    } else {
        console.log("\n❌ Verification FAILED");
    }
}

runTests().catch(console.error);
