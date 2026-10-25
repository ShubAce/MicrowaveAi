// Short lines spoken without asking the server, recorded once per voice by scripts/make_audio.mts
// into public/audio/<voice>/<name>.mp3. The screen shows the same words.

export const CLIPS = {
  "filler-1": "जी, देखती हूँ।",
  "filler-2": "अच्छा, एक पल।",
  "filler-3": "हाँ जी, बताती हूँ।",
  "no-speech": "कुछ सुनाई नहीं दिया। गुलाबी बटन दबाकर फिर से बोलिए।",
  mic: "माइक चालू नहीं हो पाया। फ़ोन की सेटिंग में इस ऐप को माइक की इजाज़त दीजिए।",
  network: "इंटरनेट नहीं चल रहा। इंटरनेट देखकर फिर से कोशिश कीजिए।",
  busy: "अभी जवाब नहीं मिल पाया। एक मिनट बाद फिर से पूछिए।",
  "no-voice": "अभी मेरी आवाज़ नहीं आ पा रही। जवाब स्क्रीन पर लिखा है, पढ़ लीजिए।",
} as const;

export type ClipName = keyof typeof CLIPS;
export const FILLERS: ClipName[] = ["filler-1", "filler-2", "filler-3"];

export const clipUrl = (voice: string, name: ClipName) => `/audio/${voice}/${name}.mp3`;
