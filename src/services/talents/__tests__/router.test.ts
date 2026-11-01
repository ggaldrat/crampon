import {selectTalents} from '../router';

describe('selectTalents', () => {
  it.each([
    ['Qui est Napoléon ?', ['wikipedia']],
    ["Qu'est-ce que la photosynthèse ?", ['wikipedia']],
    ['Où se trouve Tombouctou ?', ['wikipedia']],
    ['Who was Ada Lovelace?', ['wikipedia']],
    ['Tu connais Marie Curie ?', ['wikipedia']],
    ['Combien font 17 * 23 ?', ['calculate']],
    ['Calcule 15 % de 80', ['calculate']],
    ['Quel jour sommes-nous ?', ['datetime']],
    ["Quelle heure est-il aujourd'hui ?", ['datetime']],
    ['Résume https://example.com/article', ['read_url']],
    ['Que dit lemonde.fr ce matin ?', ['read_url']],
  ])('%s → %j', (question, expected) => {
    expect(selectTalents(question)).toEqual(expected);
  });

  it.each([
    'Bonjour !',
    'Écris-moi un poème sur la mer',
    'Merci beaucoup',
    'comment vas-tu ?',
  ])('shows no tool for "%s"', question => {
    expect(selectTalents(question)).toEqual([]);
  });

  it('can combine tools', () => {
    expect(
      selectTalents('Quel jour sommes-nous et combien font 2 + 2 ?'),
    ).toEqual(['calculate', 'datetime']);
  });
});
