import {isRepeating} from '../repetition';

describe('isRepeating', () => {
  const sentence = 'Je vais vérifier le moment actuel sur votre appareil. ';

  it('spots one sentence said over and over', () => {
    expect(isRepeating(sentence.repeat(3))).toBe(false);
    expect(isRepeating(sentence.repeat(4))).toBe(true);
  });

  it('leaves ordinary answers alone', () => {
    const answer =
      'Napoléon Ier, né le 15 août 1769 à Ajaccio, est le premier empereur ' +
      'des Français. Il règne de 1804 à 1814, puis pendant les Cent-Jours ' +
      'en 1815. Ses réformes, dont le Code civil, marquent encore la France.';
    expect(isRepeating(answer)).toBe(false);
    const list = Array.from(
      {length: 30},
      (_, i) => `${i + 1}. Ajouter ${i + 1} cuillères de farine\n`,
    ).join('');
    expect(isRepeating(list)).toBe(false);
  });
});
