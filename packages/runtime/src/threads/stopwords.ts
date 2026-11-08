// Words that never name a topic: function words, greetings and generic verbs. English is
// complete enough for titles; Spanish, German and Japanese carry only the most common words.
const english = `a an the and or but if then so of to in on at by for with from into onto about as is are was were be been being
am do does did done have has had having i me my mine we us our ours you your yours he him his she her they them their it its
this that these those there here what which who whom whose when where why how all any some no not only own same too very
can could would should will shall may might must just also again ok okay yes yeah please thanks thank hi hello hey
good morning evening afternoon need want like help get got make let lets something anything everything one able sure cannot
today yesterday tomorrow now still else last next talk tell give show find check see look know think try use getting going go
that's it's i'm i'd i've don't doesn't didn't can't won't what's`;
const spanish =
  "el la los las un una de del al y o en por para con que es necesito nuestra nuestro mi tu su hola puedo cuál cual";
const german =
  "der die das den dem des ein eine einen und oder im in über ueber von zu mit für bitte erstelle guten morgen hallo";
const japanese = "の を に は が で て と も ください しました します です ます こんにちは した";

const stopwords = new Set(
  [english, spanish, german, japanese].flatMap((list) => list.split(/\s+/)),
);

export function isStopword(word: string): boolean {
  return stopwords.has(word.toLowerCase()) || /^\d+([.,]\d+)?$/.test(word);
}
