const test = require("node:test");
const assert = require("node:assert");
const { classify } = require("../classify.js");

// Titles marked (real) were seen in FlipRadar's exported scan logs of 2026-10-23.
const CASES = {
  device: [
    "REDMI A7 PRO 4GB RAM 64GB ROM",                                   // (real)
    "OPPO A5s",                                                         // (real)
    "Samsung Galaxy Note20 5G\n256GB",                                  // (real)
    "Sell my iphone 13 pro max 256gb any sim safe to reset working all", // (real)
    "Infinix Hot 60Pro+ (Curvescreen)\n256gb GamingPhone",              // (real)
    "Redmi note 15 5g 8+256",                                           // (real)
    "For Sale Iphone 13 pro 256gb",                                     // (real)
    "SAMSUNG A54 5G 128GB",                                             // (real)
    "Sale iPhone xr lcd issue 128GB",                                   // (real) defective but still a device
    "Redmi 9t",                                                         // (real)
    "Realme narzo 50A prime",                                           // (real)
    "Poco X6 Pro 12/512 5G",
    "Tecno Spark 20 128gb 4G",
    "Vivo Y27 128GB",
    "iPhone 13 128gb with charger and box",
    "iPhone xr",
    "REDMI A3 128GB NO ISSUES ALL GOODS GAMITON UG DUGAY MA LOWBAT CLEAR CAMERA GAMING PHONE", // (real) "camera" must not make it a camera
    "fore+sale+iphone7plus+",                                           // (real) URL-style title
    "SamsungA07",                                                       // (real) no space after brand
  ],
  accessory: [
    "iPhone+charger+and+Infinix+charger+type+C+",                       // (real, 700 pesos)
    "iPhone 13 case",
    "Samsung A54 tempered glass",
    "Phone holder for car",
    "iPhone 11 lcd replacement original",
    "Samsung 25W fast charger",
    "Powerbank 20000mah",
    "iPhone 12 Pro Max back cover",
    "Original Samsung battery for Galaxy S9",
  ],
  repair: [
    "B&J IPhone Repair/Center",                                         // (real)
    "Cellphone repair services",
    "GADGET REPAIR SHOP Tagbilaran",
    "iCloud unlock service",
    "Software flashing and unlocking",
  ],
  wanted: [
    "guba cellphone paliton",                                           // (real) buying broken phones
    "CELLPHONE GUBA PALITON",                                           // (real)
    "WTB iPhone 11",
    "Looking for Samsung A54",
    "Buying used cellphones any brand",
    "Binibili namin ang iyong cellphone",
    "MO PALIT KO GUBA NGA IPHONE",                                      // (real) "I will buy your broken iPhone"
    "Guba+nga+iphone+x+pataas+paliton+nako+pm+dayon",                   // (real)
  ],
  review: [
    "Cell phone",                                                       // (real)
    "cellphone",                                                        // (real)
    "Cellphone+",                                                       // (real)
    "cellphone gadgets no issue pm sa mupalit",                         // (real) selling cue but no model
    "iPhone Brandnew & Good as new \u203c\ufe0f",                       // (real) brand only
  ],
};

for (const [expected, titles] of Object.entries(CASES)) {
  for (const title of titles) {
    test(`${expected}: ${title.replace(/\n/g, " ").slice(0, 55)}`, () => {
      const r = classify(title, 5000);
      assert.strictEqual(r.cls, expected, `got ${r.cls} (${r.reason}) kind=${r.kind}`);
    });
  }
}

test("non-phone electronics are not classified as phones", () => {
  const monitor = classify("SAMSUNG ODYSSEY G5 MONITOR BRANDNEW AND SEALED", 8000);
  assert.strictEqual(monitor.kind, "other");
  assert.strictEqual(classify("FROST FREE SAMSUNG REFRIGERATOR", 12000).kind, "other");
  assert.strictEqual(classify("FOR SALE: RAM DDR5 5600mhz 8GB (SAMSUNG)", 2000).kind, "other");   // (real) RAM stick, not a phone
  assert.strictEqual(classify("1tb Samsung 9100 pro Nvme", 5000).kind, "other");
  assert.strictEqual(classify("Samsung Galaxy Tab S3 9.7inch. With SIMCARD", 4000).kind, "tablet");
  assert.strictEqual(classify("HUAWEI MATEPAD 11.5 PAPERMATTE EDITION 256GB", 9000).kind, "tablet");
  assert.strictEqual(classify("Xiaomi Redmi Pad 2", 7000).kind, "tablet");
  assert.strictEqual(classify("Rush Sale need funds\nSamsung Galaxy Watch 6 Classic 47mm", 6000).kind, "wearable");
  assert.strictEqual(classify("REDMI PAD 2 PRO 5G and iPhone XR", 14000).kind !== "other", true);
});

test("defect flags are kept on genuine devices", () => {
  const r = classify("Sale iPhone xr lcd issue 128GB", 2500);
  assert.strictEqual(r.cls, "device");
  assert.ok(r.flags.includes("defective"));
});

test("very low price phone goes to review instead of being discarded", () => {
  const r = classify("iPhone xr", 300);
  assert.strictEqual(r.cls, "review");
  assert.ok(r.flags.includes("very-low-price"));
});
