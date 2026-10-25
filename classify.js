/* FlipRadar listing classifier.
 * Works in the browser (window.FRClassify) and in Node (require("./classify.js")).
 * classify(title, price) -> { cls, kind, reason, flags }
 *   cls:  "device"    genuine device offered for sale
 *         "accessory" accessory or replacement part
 *         "repair"    repair / unlock / service advertisement
 *         "wanted"    buying request
 *         "review"    ambiguous; keep visible and let the user decide
 *   kind: "phone" | "tablet" | "wearable" | "laptop" | "console" | "other"
 *   flags: e.g. "defective", "parts-only", "swap", "very-low-price"
 * Heuristics are intentionally conservative: when unsure, return "review".
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FRClassify = factory();
})(typeof self !== "undefined" ? self : this, function () {
  var BRANDS = "iphone|apple|samsung|galaxy|redmi|xiaomi|poco|mi|oppo|vivo|realme|infinix|tecno|honor|huawei|oneplus|pixel|motorola|moto|nubia|iqoo|nothing|zte|itel|cherry|cloudfone|myphone|sony|xperia|asus|rog|lenovo";
  var RX = {
    wanted: /\b(wtb|wanted|looking for|we buy|i buy|buying|binibili|bumibili|bilhan|paliton|iso|mo ?palit ko|palit ko|pm sa naay)\b/,
    // "pm sa mupalit" / "mupalit" means "message me if you want to buy" and is a SELLING cue, so it is not listed above.
    sellCue: /\b(for sale|sale|selling|sell|swap|rush|mupalit|available|pm|brandnew|brand new|bnew)\b/,
    repairService: /\b(repair(?:s|ing)?\s*(?:center|centre|shop|service|services|store)|repair\s*\/\s*center|(?:gadget|phone|cellphone|iphone|mobile|laptop)\s+repair|we repair|pa-?repair|screen replacement service|unlocking|unlock service|icloud\s*(?:unlock|bypass|removal)|software\s*(?:service|flash)|flashing|jailbreak)\b/,
    bareRepair: /\brepair(?:s|ing)?\b/,
    accessoryNoun: /\b(cases?|casing|covers?|chargers?|charging (?:cable|adapter|adaptor)|cables?|adapters?|adaptors?|power ?banks?|holders?|stands?|tripods?|lens(?:es)?|tempered glass|screen protectors?|protectors?|straps?|bands?|earphones?|earbuds?|headsets?|headphones?|airpods|speakers?|mounts?|gimbals?|selfie|sim tray|sim ejector|lcd|screens?|displays?|housing|back ?covers?|flex|batter(?:y|ies)|spare parts?|memory cards?|sd cards?|usb|otg|keyboards?|mouse|pouch|sleeve|ring light)\b/,
    partsOnly: /\b(for parts|parts only|spare ?parts?|for repair|needs? repair|lcd issue|screen issue|cracked|crack screen|broken|guba|defective|dead|no power|icloud locked|activation lock)\b/,
    storage: /\b(16|32|64|128|256|512|1024)\s?gb\b|\b(1|2)\s?tb\b|\b\d{1,2}\s?[+\/]\s?(32|64|128|256|512)\b/,
    tablet: /\b(ipad|tablet|tab\s?[a-z]?\d+|galaxy tab|matepad|redmi pad|mi pad|xiaomi pad|lenovo tab|tab a\d+|pad \d+)\b/,
    wearable: /\b(smart ?watch|galaxy watch|apple watch|watch \d|band \d|galaxy fit|amazfit|mi band)\b|\bwatch\b/,
    laptop: /\b(laptop|macbook|notebook|thinkpad|vivobook|ideapad|chromebook|legion|nitro)\b/,
    console: /\b(ps5|ps4|ps3|playstation|xbox|nintendo|switch|steam deck|rog ally)\b/,
    otherKind: /\b(monitors?|refrigerators?|ref|tv|television|washing machine|aircon|air ?conditioner|microwave|soundbar|printer|projector|rice cooker|oven|freezer|electric fan|router|dslr|mirrorless|gopro|cctv|webcam|drone|rtx|gtx|ryzen|motherboard|ssd|nvme|gpu|ddr[2345]|sodimm|dimm|sandisk|kingston|lexar|transcend|seagate|microsd|flash drive|pen ?drive|hdd|sata|m\.2)\b/,
    phoneSpec: /\b(?:\d{1,2}\s?[+\/]\s?(?:64|128|256|512)|\d{1,2}\s?gb\s*(?:ram)?\s*[+\/&,|-]?\s*(?:64|128|256|512|1024)\s?gb|\d{1,2}\s?gb\s*ram|ram\s*\d{1,2}\s?gb|5g|4g|lte|dual ?sim|nano ?sim|openline|unlocked|amoled|oled|super retina|fingerprint|face ?id|\d{4,5}\s?mah|snapdragon|dimensity|helio|exynos|bionic|android|rugged phone)\b/,
    phoneWord: /\b(cell ?phones?|smart ?phones?|mobile phones?|android phones?|phones?|cp|unit)\b/,
    model: new RegExp("\\b(?:" + BRANDS + ")(?![a-z])(?:\\s+[a-z]{1,10}){0,3}?[\\s-]*[a-z]?\\d{1,3}[a-z+]{0,4}|\\b(?:iphone|samsung|galaxy|redmi|poco|realme|oppo|vivo|infinix|tecno)[a-z]?\\d{1,3}"),
    iphoneModel: /\b(?:iphone|ip)\s*(?:\d{1,2}|x[rs]?|se|xs max)\b/
  };

  function normalize(t) {
    return String(t == null ? "" : t)
      .toLowerCase()
      .replace(/[\u2000-\u206f\u2190-\u2bff\ufe0f\ud800-\udfff]/g, " ")   // emoji and symbol noise
      .replace(/^\S+$/, function (m) { return m.indexOf("+") > -1 && !/\w\+$/.test(m) ? m.replace(/\+/g, " ") : m; })
      .replace(/_+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  function has(rx, t) { return rx.test(t); }
  function hasModel(t) { return RX.model.test(t) || RX.iphoneModel.test(t); }
  function hasStorage(t) { return RX.storage.test(t); }

  function kindOf(t) {
    if (RX.otherKind.test(t) && !hasStorage(t)) return "other";
    if (RX.tablet.test(t)) return "tablet";
    if (RX.laptop.test(t)) return "laptop";
    if (RX.console.test(t)) return "console";
    if (RX.wearable.test(t) && !/\b(phone|iphone)\b/.test(t)) return "wearable";
    if (RX.otherKind.test(t)) return "other";
    if (hasModel(t) || RX.phoneWord.test(t) || new RegExp("\\b(?:" + BRANDS + ")(?![a-z])").test(t)) return "phone";
    // Brand-independent: a storage size plus a phone-like spec ("12/256", "5G", "dual sim", "5000mAh") identifies phones from any maker.
    if (hasStorage(t) && RX.phoneSpec.test(t)) return "phone";
    // Nothing recognisable at all: keep it reviewable instead of calling it a non-phone.
    return "unknown";
  }

  function classify(title, price) {
    var t = normalize(title), flags = [], kind = kindOf(t), p = Number(price);
    function out(cls, reason) { return { cls: cls, kind: kind, reason: reason, flags: flags }; }

    if (RX.partsOnly.test(t)) flags.push(/for parts|parts only|spare/.test(t) ? "parts-only" : "defective");
    if (/\bswap\b/.test(t)) flags.push("swap");

    // 1. Buying requests. "pm sa mupalit" is a selling cue and is deliberately not matched here.
    if (RX.wanted.test(t) && !/\bfor sale\b/.test(t)) return out("wanted", "Buying request wording");

    // 2. Repair services. A sale listing that merely mentions a defect stays a device.
    if (RX.repairService.test(t)) return out("repair", "Repair or unlock service wording");
    if (RX.bareRepair.test(t) && !RX.sellCue.test(t) && !hasStorage(t) && !/\b(for repair|needs? repair)\b/.test(t))
      return out("repair", "Repair wording without sale cues");

    // 3. Accessories and parts. A storage size means a whole device, so it overrides noun matches such as "lcd issue".
    if (!hasStorage(t) && RX.accessoryNoun.test(t)) {
      var adjacent = new RegExp("(?:\\b(?:" + BRANDS + ")\\b(?:\\s+[a-z0-9+]{1,10}){0,3}\\s+)(?:cases?|covers?|chargers?|cables?|protectors?|holders?|lcd|screens?|displays?|batter(?:y|ies)|housing|back ?covers?|straps?|bands?|tempered glass)\\b").test(t);
      var startsWithAccessory = /^(?:cases?|covers?|chargers?|cables?|holders?|stands?|tripods?|power ?banks?|tempered glass|screen protectors?|earphones?|earbuds?|headsets?|speakers?|usb|memory cards?)\b/.test(t);
      var withDevice = /\b(with|w\/|free|plus|complete|inclusive)\b/.test(t) && hasModel(t) && !adjacent;
      if (!withDevice && (adjacent || startsWithAccessory || !hasModel(t) || /\bcharger\b.*\bcharger\b/.test(t) || /\+.*\bcharger\b/.test(String(title).toLowerCase())))
        return out("accessory", "Accessory or replacement part wording");
    }

    // 4. Non-phone devices are genuine items for sale, just not phones.
    if (kind === "unknown") return out("review", "Device type not recognised");
    if (kind !== "phone") return out("device", "Not a phone (" + kind + ")");

    // 5. Phones: need a model or storage to count as a clearly identified device.
    if (hasStorage(t) || hasModel(t)) {
      if (Number.isFinite(p) && p > 0 && p < 800) { flags.push("very-low-price"); return out("review", "Very low price for a device; may be a part or deposit"); }
      return out("device", hasModel(t) ? "Model identified" : "Storage size identified");
    }
    return out("review", "No model or storage identified");
  }

  return { classify: classify, kindOf: function (t) { return kindOf(normalize(t)); }, normalize: normalize };
});
