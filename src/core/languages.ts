// ISO 639-1 language tags, with common script/region distinctions. Names come from
// the browser's Intl/CLDR data; this list never depends on installed speech voices.
const codes =
  'aa ab ae af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu pt-BR pt-PT en-US en-GB es-419 zh-Hans zh-Hant sr-Latn sr-Cyrl fil'.split(
    ' ',
  );
const english = new Intl.DisplayNames(['en'], { type: 'language' });
export const languageName = (tag: string) => {
  if (tag === 'auto') return 'Auto · follow video';
  try {
    return english.of(tag) || tag;
  } catch {
    return tag;
  }
};
export const nativeName = (tag: string) => {
  try {
    return new Intl.DisplayNames([tag], { type: 'language' }).of(tag) || tag;
  } catch {
    return tag;
  }
};
export const languages = codes
  .map((code) => ({ code, name: languageName(code), native: nativeName(code) }))
  .sort((a, b) => a.name.localeCompare(b.name));
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
export function searchLanguages(query: string, favorites: string[] = [], recent: string[] = []) {
  const q = fold(query.trim());
  return languages
    .filter((l) => fold(`${l.name} ${l.native} ${l.code}`).includes(q))
    .sort(
      (a, b) =>
        Number(favorites.includes(b.code)) - Number(favorites.includes(a.code)) ||
        Number(recent.includes(b.code)) - Number(recent.includes(a.code)) ||
        a.name.localeCompare(b.name),
    );
}
export const direction = (tag: string): 'rtl' | 'ltr' =>
  /^(ar|he|fa|ur|ps|sd|ug|yi|dv|ku-Arab)(-|$)/i.test(tag) ? 'rtl' : 'ltr';
export function words(text: string, language: string) {
  try {
    return [...new Intl.Segmenter(language, { granularity: 'word' }).segment(text)].map((s) => ({
      text: s.segment,
      index: s.index,
      word: !!s.isWordLike,
    }));
  } catch {
    return [{ text, index: 0, word: false }];
  }
}
