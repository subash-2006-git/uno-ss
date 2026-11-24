// Reaction pictures. The server only knows the ids (see EMOTE_IDS in shared/uno.js).
export const EMOTES = {
  thumbs: '\u{1F44D}', laugh: '\u{1F602}', wow: '\u{1F62E}', angry: '\u{1F621}',
  clap: '\u{1F44F}', fire: '\u{1F525}', cry: '\u{1F62D}', party: '\u{1F389}',
};
export const EMOTE_LABELS = {
  thumbs: 'Thumbs up', laugh: 'Laughing', wow: 'Wow', angry: 'Angry', clap: 'Clapping', fire: 'Fire', cry: 'Crying', party: 'Party',
};

// A readable, stable colour per player name for chat (light enough for dark panels).
export function nameColor(name = '') {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 75% 72%)`;
}
