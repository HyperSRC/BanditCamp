import * as cheerio from "cheerio";
import * as fs from "fs";
import axios from "axios";
import NodeID3 from "node-id3"
import readline from 'node:readline';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question(`Input an album URL from bandcamp: `, url => {
    const pattern = /^https?:\/\/([a-z0-9-]+\.)?bandcamp\.com\/(track|album)\/[^ ]+/i; // I got ChatGPT to write this pattern thingy cause I don't know how to do this.
    if (!pattern.test(url)) console.error("Please enter a valid bandcamp track/album.");
    else getAlbum(url);

    rl.close();
});

async function getAlbum(song) {
    try {
        const res = await axios.get(song), 
            html = res.data,
            $ = cheerio.load(html);

        let isSingle = false;

        $('[data-tralbum]').each((_, element) => {
            let album = {};

            const albumInfo = $(element).attr("data-tralbum");

            if (albumInfo) {
                const parsedInfo = JSON.parse(albumInfo);

                if (parsedInfo) {
                    const tracks = parsedInfo.trackinfo,
                        artist = parsedInfo.artist,
                        albumName = parsedInfo.current.title,
                        itemType = parsedInfo["item_type"];;

                    if (artist) album["artist"] = artist;
                    if (albumName) album["album"] = albumName;
                    if (tracks) album["tracks"] = [];

                    let coverArt = parsedInfo.current["art_id"];
                    if (coverArt) {
                        coverArt = `https://f4.bcbits.com/img/a${coverArt}_10.jpg`
                        album["coverArt"] = coverArt;
                    }

                    if (itemType == "track") isSingle = true;
                    else if (itemType == "album") isSingle = false;

                    for (let i = 0; i < tracks.length; i++) {
                        const title = tracks[i].title,
                            file = tracks[i].file["mp3-128"],
                            track = tracks[i]["track_num"];

                        album["tracks"].push({
                            "file": file,
                            "track": track,
                            "name": title
                        });
                    }
                }
            }

            downloadAlbum(album, isSingle);
        })   
    } catch(e) {
        console.error(e);
    }
}

async function downloadAlbum(data, isSingle) {
    try {
        const tracks = data.tracks,
            album = data.album,
            artist = data.artist;
        let coverArt = data.coverArt;
        coverArt = await axios.get(coverArt, { responseType: "arraybuffer" });
        coverArt = Buffer.from(coverArt.data, "base64");

        let path = "";
        if (isSingle) path = `./${artist}`;
        else path = `./${artist}/${album}`;
        fs.mkdirSync(path, { recursive: true })

        for (let i = 0; i < tracks.length; i++) {
            const res = await axios.get(tracks[i].file, { responseType: "arraybuffer" });

            const buffer = Buffer.from(res.data);
            const tags = {
                title: tracks[i].name,
                TRCK: tracks[i].track,
                album: album,
                artist: artist,
                APIC: coverArt
            }
            const tagged = NodeID3.write(tags, buffer);

            fs.writeFileSync(`${path}/${tracks[i].name}.mp3`, tagged);
        }
    } catch(e) {
        console.error(e);
    }
}