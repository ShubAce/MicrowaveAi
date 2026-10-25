// Which picture each step gets (src/lib/steps.ts). Run: npx tsx tests/scenes.mts
// Each case is [markup, expected summary]. Summary format (compact):
//   panel: "P:" + actions joined by " " where press = ID/how[xN][Ns][@dialFor], chores = stir|flip|wait[N]|place[acc]|takeout
//          + " |" + readout values (with ~ when it goes), each pair joined by "/" for or, ">" for then
//   place[acc] | arrange[acc] | pour[acc] | takeout[g] | beep:action[acc|N]>BUTTONS | stir | flip | wait[N] | display | ready | null
import { describeStep, type Action, type Readout, type StepScene } from "../src/lib/steps";
import { TILES } from "../src/lib/tiles";

const act = (a: Action) =>
  a.kind === "press" ? `${a.id}/${a.how}${a.times ? `x${a.times}` : ""}${a.seconds && a.seconds !== 3 ? `${a.seconds}s` : ""}${a.dialFor ? `@${a.dialFor}` : ""}`
  : a.kind === "wait" ? `wait${a.minutes ?? ""}` : a.kind === "place" ? `place[${a.accessory ?? ""}]` : a.kind;

const shown = (r: Readout) =>
  r.values.map((v, i) => (i ? (r.joins[i - 1] === "or" ? "/" : ">") : "") + v.text + (v.goes ? "~" : "")).join("");

function sum(s: StepScene | null): string {
  if (!s) return "null";
  switch (s.kind) {
    case "panel":
      return "P:" + s.actions.map(act).join(" ") + (s.readout ? ` |${shown(s.readout)}` : "");
    case "place": return `place[${s.accessory ?? ""}]`;
    case "arrange": return `arrange[${s.accessory}]`;
    case "pour": return `pour[${s.accessory ?? ""}]`;
    case "takeout": return `takeout${s.gloves ? "[g]" : ""}`;
    case "beep": return `beep:${s.action}${s.accessory ? `[${s.accessory}]` : ""}${s.minutes ?? ""}>${s.then.join(",")}`;
    case "wait": return `wait${s.minutes ?? ""}`;
    case "display": return `display:${shown(s.readout)}`;
    default: return s.kind;
  }
}

const cases: [string, string][] = [
  // reviewers' cases: not putting food in
  ["प्रीहीट के समय ओवन में कुछ भी मत रखिए।", "null"],
  ["अभी अंदर कुछ न रखें।", "null"],
  ["स्टील या धातु का बर्तन अंदर मत रखिए।", "null"],
  ["माइक्रोवेव मोड में कभी भी स्टील या धातु के बर्तन न रखें।", "null"],
  ["पनीर को ढककर फ्रिज में 2 घंटे रख दीजिए।", "null"],
  ["दस्ताने पहनकर तवा बाहर निकालिए और प्लेट में रखिए।", "takeout[g]"],
  ["खाना 5 मिनट ढककर रखिए।", "wait5"],
  // press-how from the button's own clause
  ["[START] दबाइए। जब तक {End} न दिखे, दरवाज़ा मत खोलिए।", "P:START/tap |End"],
  ["[START] दबाइए और तब तक पकने दीजिए जब तक {End} न आ जाए।", "P:START/tap |End"],
  ["[STOP] दबाइए, फिर तब तक [AIR_FRY] दबाइए जब तक {1} न आ जाए।", "P:STOP/tap AIR_FRY/repeat |1"],
  ["डिस्प्ले पर {5} आने तक [CHARCOAL] दबाइए।", "P:CHARCOAL/repeat |5"],
  ["जब तक डिस्प्ले पर {5} न आ जाए, तब तक [CHARCOAL] दबाते रहिए।", "P:CHARCOAL/repeat |5"],
  ["[CHARCOAL] को बार-बार दबाकर डिस्प्ले पर {5} लाइए।", "P:CHARCOAL/repeat |5"],
  ["[KIDS_DAIRY] को तीन बार दबाइए।", "P:KIDS_DAIRY/repeatx3"],
  ["[START] को चार बार दबाइए।", "P:START/repeatx4"],
  // beep only when the step starts with it
  ["[DIAL] से वज़न चुनिए और [START] दबाइए। बीप होने पर पलटिए।", "P:DIAL/turn@weight START/tap flip"],
  ["[START] दबाइए। ओवन खाली गरम होगा, बीप होने तक रुकिए।", "P:START/tap wait"],
  ["हर बटन दबाने पर एक बीप होती है।", "null"],
  // beep actions
  ["बीप होने पर टमाटर प्यूरी, मसाले और पनीर डालिए, फिर [START] दबाइए।", "beep:add>START"],
  ["बीप होने पर बाउल में दही डालें और [START] दबाइए।", "beep:add>START"],
  ["बीप होने पर मटर डालकर मिला दीजिए और [START] दबाइए।", "beep:add>START"],
  ["बीप होने पर पिज़्ज़ा को लो रैक पर रखिए और [START] दबाइए, यह लगभग 12 मिनट में बनेगा।", "beep:place[low_rack]>START"],
  ["बीप होने पर तवे को हाई रैक पर रखिए और [START] दबाइए।", "beep:place[tawa_high]>START"],
  ["बीप होने पर खाना मिक्स कीजिए और [START] दबाइए।", "beep:stir>START"],
  ["बीप होने पर टुकड़े उलट दीजिए और [START] दबाइए।", "beep:flip>START"],
  ["बीप होने पर 2 मिनट रुकिए।", "beep:wait2>"],
  ["बीप होने पर, दरवाज़ा खोलिए, पनीर के टुकड़ों को पलटिए और [START] दबाइए।", "beep:flip>START"],
  // hold
  ["[STOP] बटन को 3 सेकंड दबा कर रखिए।", "P:STOP/hold"],
  ["[STOP] को 3 सेकंड के लिए दबाइए, डिस्प्ले से {Loc} हट जाएगा।", "P:STOP/hold |Loc~"],
  ["[STOP] को 3 सेकंड दबाएँ रखें।", "P:STOP/hold"],
  ["[STOP] को तब तक दबाइए जब तक {Loc} हट न जाए।", "P:STOP/hold |Loc~"],
  ["[STOP] बटन को तब तक दबाकर रखिए जब तक डिस्प्ले से {Loc} लिखा हुआ हट न जाए।", "P:STOP/hold |Loc~"],
  // repeated buttons
  ["[DIAL] घुमाकर {2-1} लाइए और [START] दबाइए। वज़न 500 ग्राम रहने दीजिए और फिर [START] दबाइए।", "P:DIAL/turn@code START/tap START/tap |2-1"],
  ["[DIAL] घुमाकर {1-9} लाइए और [START] दबाइए, फिर [DIAL] से वज़न चुनिए और [START] दबाइए।", "P:DIAL/turn@code START/tap DIAL/turn@weight START/tap |1-9"],
  ["[STOP] दबाइए, फिर [STOP] को 3 सेकंड दबाकर रखिए जब तक {Loc} न दिखे।", "P:STOP/tap STOP/hold |Loc"],
  // dial purpose
  ["[DIAL] घुमाकर तापमान {180°C} कीजिए और [START] दबाइए।", "P:DIAL/turn@temperature START/tap |180°C"],
  ["[DIAL] से वज़न {0.5} चुनिए।", "P:DIAL/turn@weight |0.5"],
  ["[DIAL] घुमाकर समय {2:00} कीजिए।", "P:DIAL/turn@time |2:00"],
  ["[COOK_MODE] को तब तक दबाइए जब तक {GrlL} न आ जाए, फिर [DIAL] से 10 मिनट चुनिए और [START] दबाइए।", "P:COOK_MODE/repeat DIAL/turn@time START/tap |GrlL"],
  ["[COOK_MODE] को तब तक दबाइए जब तक {CC-1} न आ जाए, फिर [DIAL] से तापमान 180 डिग्री चुनिए।", "P:COOK_MODE/repeat DIAL/turn@temperature |CC-1"],
  ["[DIAL] से 300 ग्राम चुनिए।", "P:DIAL/turn@weight"],
  // tawa racks, accessories
  ["मल्टीकुक तवे को हाई रैक पर रखिए और उस पर आलू के टुकड़े रख दीजिए।", "place[tawa_high]"],
  ["आलू के टुकड़े हाई रैक पर रखिए।", "place[high_rack]"],
  ["पिज़्ज़ा को लो रैक पर रखिए।", "place[low_rack]"],
  ["दूध की थैली काटकर दूध चौड़े बाउल में डालिए।", "pour[bowl]"],
  ["दूध चौड़े मुँह वाले माइक्रोवेव-सेफ कांच के बर्तन में डालिए, पतली गर्दन वाले बर्तन में नहीं।", "pour[bowl]"],
  ["खाना माइक्रोवेव-सेफ प्लेट में रखिए।", "place[plate]"],
  ["फ्राइज़ को एयर फ्राई की ट्रे पर फैलाकर रखें।", "arrange[air_fry_tray]"],
  ["समोसे एयरफ्राई ट्रे पर रखिए।", "arrange[air_fry_tray]"],
  ["खाना एयर फ्राई ट्रे पर एक परत में फैलाकर अंदर रखिए।", "place[air_fry_tray]"],
  ["सीख कबाब को माइक्रोवेव-सेफ प्लेट में रखकर अंदर रखिए।", "place[plate]"],
  ["पॉपकॉर्न के पैकेट को निर्देशानुसार ग्लास ट्रे पर रखें।", "place[popcorn]"],
  ["मसाला लगी चीज़ें मल्टीकुक तवे पर रखिए और तवा रेसिपी के हिसाब से हाई या लो रैक पर रखिए।", "place[tawa_rack]"],
  ["गरम होने के बाद दूध को थोड़ी देर अंदर ही रहने दीजिए, फिर धीरे से निकालिए।", "wait"],
  ["गरम होने के बाद दूध को थोड़ी देर अंदर ही रहने दीजिए, फिर धीरे से निकालिए, एक बार और चलाइए और पीने से पहले गरमी जाँच लीजिए।", "wait"],
  ["500 ग्राम मलाई को हैंड मिक्सर से मथकर मक्खन बना लीजिए, और मक्खन को ठंडे पानी में दो-तीन बार धो लीजिए।", "null"],
  ["सब कुछ अच्छी तरह मिक्स कीजिए।", "stir"],
  ["बाहर निकालकर 5 मिनट रहने दीजिए।", "takeout"],
  ["मैरिनेट किए हुए पनीर और सब्ज़ियों को मल्टीकुक तवा पर रखिए और तवे को लो रैक पर रखिए।", "place[tawa_low]"],
  // goes only for the display value
  ["लॉक लगाने के लिए [STOP] को 3 सेकंड दबाकर रखिए, {Loc} दिखते ही उँगली हटा लीजिए।", "P:STOP/hold |Loc"],
  ["खाने की प्लास्टिक पैकिंग हटाइए, फिर [CHARCOAL] को तब तक दबाइए जब तक {5} न आ जाए।", "P:CHARCOAL/repeat |5"],
  ["[STOP] को तब तक दबाए रखिए जब तक {Loc} दिखना बंद न हो जाए।", "P:STOP/hold |Loc~"],
  // button + stir/flip
  ["बीच में खाना बाहर से अंदर की ओर चलाइए, और गरम करना हो तो फिर [START] दबाइए।", "P:stir START/tap"],
  ["आधे समय पर [STOP] दबाइए, खाना पलटिए और फिर [START] दबाइए।", "P:STOP/tap flip START/tap"],
  ["आधा पकने पर तवा बाहर निकालिए, टुकड़े पलटिए और फिर अंदर रखिए।", "takeout"],
  // run vs stir, ready
  ["माइक्रोवेव में 100% पावर पर 3 मिनट चलाइए।", "null"],
  ["स्टफिंग तैयार कर लीजिए।", "null"],
  ["खाना तैयार होने के बाद 5 मिनट अंदर ही रहने दीजिए।", "wait5"],
  ["आपका खाना तैयार है।", "ready"],
  // group then code
  ["[AIR_FRY] को तब तक दबाइए जब तक {1} न आ जाए, फिर [DIAL] घुमाकर {1-13} लाइए।", "P:AIR_FRY/repeat DIAL/turn@code |1>1-13"],
  ["[DIAL] घुमाकर {5-3} या {5-2} लाइए।", "P:DIAL/turn@code |5-3/5-2"],
  // from earlier Gemini answers
  ["[CHARCOAL] को तब तक दबाइए जब तक डिस्प्ले पर {1} न आ जाए।", "P:CHARCOAL/repeat |1"],
  ["[DIAL] घुमाकर {1-9} लाइए और [START] दबाइए।", "P:DIAL/turn@code START/tap |1-9"],
  ["[COOK_MODE] को तब तक दबाइए, जब तक डिस्प्ले पर {GrlL} न आ जाए, और [START] दबाइए।", "P:COOK_MODE/repeat START/tap |GrlL"],
  ["जब पॉपिंग की आवाज़ रुक जाए, तब [STOP] दबाएं और पैकेट बाहर निकालें।", "P:STOP/tap takeout"],
  ["ओवन खाली रखें। जब बीप सुनाई दे, तब पिज़्ज़ा को लो रैक पर रखकर ओवन में रखें और [START] दबाइए।", "beep:place[low_rack]>START"],
  // second review: lock and Wi-Fi holds written with a comma
  ["[STOP] को तब तक दबाइए, जब तक डिस्प्ले से {Loc} न हट जाए।", "P:STOP/hold |Loc~"],
  ["[STOP] को तब तक दबाइए, जब तक डिस्प्ले पर {Loc} न आ जाए।", "P:STOP/hold |Loc"],
  ["[STOP] को दबाइए और {Loc} हटने तक दबाए रखिए।", "P:STOP/hold |Loc~"],
  ["[STOP] दबाइए और 3 सेकंड तक दबाए रखिए।", "P:STOP/hold"],
  ["[START] दबाइए, जब तक {End} न दिखे, दरवाज़ा मत खोलिए।", "P:START/tap |End"],
  ["[COOK_MODE] को तब तक दबाइए, जब तक वाई-फाई का निशान न जल जाए।", "P:COOK_MODE/hold"],
  // microwave-mode safety sentences never show metal going in
  ["माइक्रोवेव मोड में सिर्फ कांच या माइक्रोवेव-सेफ बर्तन रखिए, स्टील, फॉइल, रैक या तवा कभी नहीं।", "place[bowl]"],
  ["माइक्रोवेव मोड में तवे की जगह कांच का बाउल रखिए।", "null"],
  ["ग्रिल मोड में तवा हाई रैक पर रखिए, माइक्रोवेव मोड में तवा कभी नहीं।", "place[tawa_high]"],
  ["कन्वेक्शन मोड में केक टिन लो रैक पर रखिए, माइक्रोवेव मोड में नहीं।", "place[low_rack]"],
  ["तवा रखकर माइक्रोवेव मोड चलाने से चिंगारी निकलती है।", "null"],
  // "until" after दबाकर is a single press; 30 seconds is the quick start, not a hold
  ["[START] दबाकर {End} आने तक इंतज़ार कीजिए।", "P:START/tap |End"],
  ["[DIAL] से समय {3:00} चुनिए, फिर [START] दबाकर {End} आने तक इंतज़ार कीजिए।", "P:DIAL/turn@time START/tap |3:00>End"],
  ["30 सेकंड के लिए [START] दबाइए।", "P:START/tap"],
  ["[START] को 30 सेकंड के लिए दबाइए।", "P:START/tap"],
  ["[STOP] को 8 सेकंड तक दबाकर रखिए, जब तक डिस्प्ले पर {5} न आ जाए।", "P:STOP/hold8s |5"],
  // preheat menus: food made ready on the tawa or tray outside the oven
  ["इस बीच कुकीज़ को मल्टीकुक तवे पर रखिए।", "arrange[tawa]"],
  ["जब तक ओवन गरम हो रहा है, एक चम्मच घोल तवे पर फैलाकर पैनकेक बनाइए।", "arrange[tawa]"],
  ["बाटी को तवा लो रैक पर रखिए और अलग रख दीजिए।", "null"],
  ["कुकीज़ तवे पर रखिए, अभी अंदर नहीं।", "arrange[tawa]"],
  // both racks named
  ["बीप होने पर पिज़्ज़ा लो रैक पर रखिए, हाई रैक पर नहीं, और [START] दबाइए।", "beep:place[low_rack]>START"],
  ["केक टिन को लो रैक पर रखिए, हाई रैक पर नहीं।", "place[low_rack]"],
  ["हाई रैक से हटाकर लो रैक पर रखिए।", "place[low_rack]"],
  // presses the step forbids
  ["प्रीहीट के बीच में [STOP] मत दबाइए।", "null"],
  ["[START] को बार-बार मत दबाइए, नहीं तो समय बढ़ता जाएगा।", "null"],
  ["ज़्यादा देर के लिए [START] को बार-बार दबाने की बजाय [DIAL] से समय चुनिए और [START] दबाइए।", "P:DIAL/turn@time START/tap"],
  ["बीप होने पर पलटिए और [START] दबाइए, [STOP] मत दबाइए।", "beep:flip>START"],
  ["बिना [STOP] दबाए [START] दबाइए।", "P:START/tap"],
  // display values: either or one after the other, per gap
  ["[CHARCOAL] को तब तक दबाइए, जब तक {5} न आ जाए, फिर [DIAL] से सब्ज़ी के लिए {5-2} या चिकन के लिए {5-3} चुनिए।", "P:CHARCOAL/repeat DIAL/turn@code |5>5-2/5-3"],
  ["[CHARCOAL] को तब तक दबाइए, जब तक {5} न आ जाए, फिर [DIAL] घुमाकर चिकन या मटन के लिए {5-3} लाइए।", "P:CHARCOAL/repeat DIAL/turn@code |5>5-3"],
  ["[COOK_MODE] को तब तक दबाइए जब तक {GC-1}, {GC-2} या {GC-3} में से सही न आए।", "P:COOK_MODE/repeat |GC-1/GC-2/GC-3"],
  // counts
  ["[START] को दस बार दबाइए।", "P:START/repeatx10"],
  ["[START] को कई बार दबाइए।", "P:START/repeat"],
  ["[START] को छह से आठ बार दबाइए।", "P:START/repeat"],
  ["फिर [START] दोबारा दबाइए।", "P:START/tap"],
  // taken out of a packet, not out of the oven
  ["पैकेट से फ्राइज़ निकालकर एयर फ्राई ट्रे पर एक परत में रखिए।", "arrange[air_fry_tray]"],
  ["नींबू के बीज निकालकर रस बाउल में डालिए।", "pour[bowl]"],
  ["फ्रिज से खाना निकालकर माइक्रोवेव-सेफ प्लेट में रखिए।", "place[plate]"],
  // a value that appears is not struck out
  ["[START] दबाइए, {End} आने पर माइक्रोवेव अपने आप बंद हो जाएगा।", "P:START/tap |End"],
  ["{End} आने पर पॉपकॉर्न का पैकेट सावधानी से हटाइए।", "display:End"],
];

let bad = 0;
for (const [m, want] of cases) {
  const got = sum(describeStep(m));
  if (got !== want) {
    bad++;
    console.log(`✗ ${m}\n    want ${want}\n    got  ${got}`);
  }
}
console.log(`${cases.length - bad}/${cases.length} cases pass`);
// --tiles also lists the picture of every quick-answer step, to look over by eye.
if (process.argv.includes("--tiles")) {
  for (const t of TILES) t.answer.steps.forEach((s, i) => console.log(`${t.id}-${i + 1}  ${sum(describeStep(s))}\n      ${s}`));
}
process.exitCode = bad ? 1 : 0;
