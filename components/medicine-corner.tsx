"use client";
/* eslint-disable @next/next/no-img-element -- DailyMed provides runtime product-label image URLs that cannot be safely preconfigured for Next image optimization. */

import { useMemo, useState } from "react";
import { BilingualText, useLanguage, type Copy } from "@/components/language";
import { Icon } from "@/components/icons";
import { ClayCard, PageShell, SectionHeading, StatusPill } from "@/components/ui";
import { medicineCategories, medicines, type Medicine } from "@/lib/medicines";

type VerifiedProduct = {
  setId: string;
  labelTitle: string;
  productName: string | null;
  genericName: string | null;
  activeIngredients: Array<{ name: string; strength: string | null }>;
  ndcs: string[];
  packaging: string[];
  imageUrls: string[];
  labelUrl: string;
  publishedDate: string | null;
};

function VerifiedProductPhotos({ medicine }: { medicine: Medicine }) {
  const { language } = useLanguage();
  const [products, setProducts] = useState<VerifiedProduct[] | null>(null);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [image, setImage] = useState(0);
  const [imageUnavailable, setImageUnavailable] = useState(false);
  const product = products?.[selected];

  async function load() {
    if (loading || products) return;
    setLoading(true); setFailed(false);
    try {
      const response = await fetch(`/api/medicines/products?medicineId=${encodeURIComponent(medicine.id)}`, { cache: "force-cache" });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.products)) throw new Error("DailyMed response was invalid");
      setProducts(data.products); setSelected(0); setImage(0); setImageUnavailable(false);
    } catch { setFailed(true); } finally { setLoading(false); }
  }

  return <div className="verified-products">
    <button type="button" className="button button-secondary medicine-photo-button" onClick={() => void load()} disabled={loading}>
      <Icon name="document" /><BilingualText copy={loading ? { bn: "যাচাইকৃত ছবি খোঁজা হচ্ছে…", en: "Finding verified photos…" } : { bn: "যাচাইকৃত পণ্যের ছবি", en: "Verified product photos" }} />
    </button>
    {failed && <p className="medicine-photo-notice" role="status"><BilingualText copy={{ bn: "এখন DailyMed থেকে ছবি পাওয়া যাচ্ছে না। পরে আবার চেষ্টা করুন।", en: "DailyMed photos are unavailable right now. Try again later." }} /></p>}
    {products && products.length === 0 && <p className="medicine-photo-notice" role="status"><BilingualText copy={{ bn: "এই জেনেরিকের জন্য DailyMed-এ যাচাইকৃত পণ্যের ছবি পাওয়া যায়নি।", en: "No verified product photo is available from DailyMed for this generic." }} /></p>}
    {product && <div className="verified-product-result">
      <p className="verified-product-disclaimer"><BilingualText copy={{ bn: "DailyMed-এর যুক্তরাষ্ট্রের লেবেল পণ্য। বাংলাদেশের প্যাকেটের সঙ্গে না-ও মিলতে পারে—নাম, শক্তি, ধরন ও প্রস্তুতকারক মিলিয়ে নিন।", en: "A U.S. DailyMed label product. It may not match Bangladesh packaging—confirm the name, strength, form, and manufacturer." }} /></p>
      {products.length > 1 && <label className="verified-product-select"><BilingualText copy={{ bn: "লেবেল পণ্য নির্বাচন করুন", en: "Choose the label product" }} /><select value={selected} onChange={(event) => { setSelected(Number(event.target.value)); setImage(0); setImageUnavailable(false); }}>{products.map((item, index) => <option key={item.setId} value={index}>{item.labelTitle}</option>)}</select></label>}
      <div className="verified-product-body">
        <div className="verified-product-image-wrap">{!imageUnavailable && product.imageUrls[image] ? <img src={product.imageUrls[image]} alt={`${product.labelTitle} — DailyMed product image`} className="verified-product-image" onError={() => { if (image + 1 < product.imageUrls.length) setImage(image + 1); else setImageUnavailable(true); }} /> : <BilingualText copy={{ bn: "ছবি এখন পাওয়া যাচ্ছে না", en: "Photo unavailable" }} />}</div>
        <div><strong lang="en">{product.productName ?? product.labelTitle}</strong>
          {product.genericName && <p><BilingualText copy={{ bn: `জেনেরিক: ${product.genericName}`, en: `Generic: ${product.genericName}` }} /></p>}
          {product.activeIngredients.length > 0 && <p><BilingualText copy={{ bn: `উপাদান: ${product.activeIngredients.map((item) => `${item.name}${item.strength ? ` (${item.strength})` : ""}`).join(", ")}`, en: `Ingredients: ${product.activeIngredients.map((item) => `${item.name}${item.strength ? ` (${item.strength})` : ""}`).join(", ")}` }} /></p>}
          {product.ndcs.length > 0 && <p lang="en">NDC: {product.ndcs.join(", ")}</p>}
          <a href={product.labelUrl} target="_blank" rel="noreferrer" className="medicine-source"><Icon name="document" /><BilingualText copy={{ bn: "DailyMed লেবেল দেখুন", en: "View DailyMed label" }} /></a>
        </div>
      </div>
      {product.imageUrls.length > 1 && <div className="verified-product-thumbnails" aria-label={language === "bn" ? "পণ্যের অন্য ছবি" : "Other product photos"}>{product.imageUrls.map((url, index) => <button type="button" key={url} aria-pressed={image === index} aria-label={language === "bn" ? `ছবি ${index + 1}` : `Photo ${index + 1}`} onClick={() => { setImage(index); setImageUnavailable(false); }}><img src={url} alt="" /></button>)}</div>}
    </div>}
  </div>;
}

function MedicineCard({ medicine }: { medicine: Medicine }) {
  return <ClayCard as="article" className="medicine-card">
    <div className="medicine-card-heading">
      <span className="medicine-symbol" aria-hidden="true"><Icon name="document" /></span>
      <div>
        <h3><BilingualText copy={medicine.genericName} /></h3>
        <StatusPill icon="info" label={medicine.category} />
      </div>
    </div>
    <div className="medicine-card-section">
      <strong><BilingualText copy={{ bn: "সাধারণ ব্যবহার", en: "General use" }} /></strong>
      <p><BilingualText copy={medicine.purpose} /></p>
    </div>
    <div className="medicine-card-section">
      <strong><BilingualText copy={{ bn: "সতর্কতা", en: "Important caution" }} /></strong>
      {medicine.commonWarnings.map((warning) => <p key={warning.en}><BilingualText copy={warning} /></p>)}
    </div>
    <div className="medicine-card-section medicine-urgent">
      <strong><BilingualText copy={{ bn: "দ্রুত সাহায্য নিন", en: "Get urgent help" }} /></strong>
      {medicine.urgentWarnings.map((warning) => <p key={warning.en}><BilingualText copy={warning} /></p>)}
    </div>
    <VerifiedProductPhotos medicine={medicine} />
    <a href={medicine.sourceUrl} target="_blank" rel="noreferrer" className="medicine-source"><Icon name="document" /><BilingualText copy={{ bn: "লেবেল ও উৎস দেখুন", en: "View label source" }} /></a>
  </ClayCard>;
}

export function MedicineCorner() {
  const { language } = useLanguage();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("ALL");
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return medicines.filter((medicine) => (category === "ALL" || medicine.category.en === category) && (!normalized || [medicine.genericName.en, medicine.genericName.bn, medicine.category.en, medicine.category.bn, medicine.purpose.en, medicine.purpose.bn].join(" ").toLocaleLowerCase().includes(normalized)));
  }, [category, query]);
  const copy: Record<string, Copy> = {
    all: { bn: "সব বিভাগ", en: "All categories" },
    results: { bn: `${visible.length}টি ফল`, en: `${visible.length} results` },
  };

  return <PageShell eyebrow={{ bn: "ওষুধের তথ্য", en: "Medicine information" }} title={{ bn: "মেডিসিন কর্নার", en: "Medicine Corner" }} description={{ bn: "সাধারণ জেনেরিক ওষুধের সহজ তথ্য, সতর্কতা ও উৎস। এটি প্রেসক্রিপশন, ডোজ বা রোগ নির্ণয় নয়।", en: "Plain-language information, cautions, and sources for common generic medicines. This is not a prescription, dose, or diagnosis." }} icon="pharmacy">
    <ClayCard className="medicine-safety" role="note">
      <Icon name="shield" />
      <div><StatusPill tone="warning" icon="info" label={{ bn: "নিরাপদভাবে ব্যবহার করুন", en: "Use safely" }} /><p><BilingualText copy={{ bn: "প্যাকেটের নাম, শক্তি ও নির্দেশনা ফার্মাসিস্ট বা চিকিৎসকের সঙ্গে মিলিয়ে নিন। একই রকম দেখতে ছবি, নাম বা রঙ দিয়ে ওষুধ শনাক্ত করবেন না।", en: "Confirm the pack name, strength, and instructions with a pharmacist or clinician. Do not identify a medicine from a look-alike photo, name, or colour." }} /></p><p><BilingualText copy={{ bn: "বাংলাদেশে পাওয়া যায় কি না, ব্র্যান্ড, দাম ও অনুমোদন এই তালিকা নিশ্চিত করে না।", en: "This list does not confirm Bangladesh availability, brand, price, or approval." }} /></p></div>
    </ClayCard>
    <section className="section-block" aria-labelledby="medicine-search-heading">
      <SectionHeading id="medicine-search-heading" title={{ bn: "ওষুধ খুঁজুন", en: "Find a medicine" }} description={{ bn: "জেনেরিক নাম, বাংলা নাম, বিভাগ বা সাধারণ ব্যবহারে খুঁজুন।", en: "Search by generic name, Bangla name, category, or general use." }} />
      <ClayCard className="medicine-search-panel">
        <label htmlFor="medicine-query"><BilingualText copy={{ bn: "অনুসন্ধান", en: "Search" }} /></label>
        <div className="medicine-search-input"><Icon name="search" /><input id="medicine-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={language === "bn" ? "যেমন: প্যারাসিটামল" : "For example: paracetamol"} /></div>
        <label htmlFor="medicine-category"><BilingualText copy={{ bn: "বিভাগ", en: "Category" }} /></label>
        <select id="medicine-category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="ALL">{copy.all[language]}</option>{medicineCategories.map((item) => <option key={item.en} value={item.en}>{item[language]}</option>)}</select>
        <p className="medicine-result-count" aria-live="polite"><BilingualText copy={copy.results} /></p>
      </ClayCard>
    </section>
    <section className="section-block" aria-label={language === "bn" ? "ওষুধের ফল" : "Medicine results"}>
      {visible.length ? <div className="medicine-grid">{visible.map((medicine) => <MedicineCard key={medicine.id} medicine={medicine} />)}</div> : <ClayCard><p><BilingualText copy={{ bn: "এই অনুসন্ধানে কোনো ওষুধ পাওয়া যায়নি। জেনেরিক নাম দিয়ে আবার চেষ্টা করুন।", en: "No medicine matches this search. Try a generic name." }} /></p></ClayCard>}
    </section>
    <section className="section-block"><SectionHeading title={{ bn: "তালিকাটি কীভাবে তৈরি", en: "How this list is built" }} /><ClayCard><p><BilingualText copy={{ bn: "তালিকায় ১০০-এর বেশি সাধারণ জেনেরিক উপাদান আছে। তথ্যটি যুক্তরাষ্ট্রের DailyMed লেবেল অনুসন্ধান ও যক্ষ্মার ক্ষেত্রে WHO নির্দেশিকার দিকে পাঠায়। লেবেল অঞ্চলভেদে ভিন্ন হতে পারে; বাংলাদেশের প্যাকেটের তথ্য ও নিবন্ধন যাচাইয়ের জন্য স্থানীয় ফার্মাসিস্ট বা অনুমোদিত উৎস ব্যবহার করুন।", en: "The list contains over 100 common generic ingredients. It links to U.S. DailyMed label searches and, for TB medicines, WHO guidance. Labels vary by country; use the local pack information and a pharmacist or approved local source to verify Bangladesh registration." }} /></p></ClayCard></section>
  </PageShell>;
}
