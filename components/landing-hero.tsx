"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { BilingualText } from "@/components/language";
import { Icon } from "@/components/icons";
import { ActionLink } from "@/components/ui";
import { defaultDemoPharmacy, getPharmacyScreeningPath } from "@/lib/pharmacies";

const careSteps = [
  {
    href: "/screen?source=self",
    icon: "screen" as const,
    kicker: { bn: "নিজের গতিতে", en: "At your pace" },
    label: { bn: "সংক্ষিপ্ত যাচাই", en: "Short check" },
  },
  {
    href: getPharmacyScreeningPath(defaultDemoPharmacy.id),
    icon: "pharmacy" as const,
    kicker: { bn: "সহায়তা নিয়ে", en: "With support" },
    label: { bn: "ফার্মেসিতে শুরু", en: "Start at a pharmacy" },
  },
  {
    href: "/assistant",
    icon: "care" as const,
    kicker: { bn: "প্রশ্ন থাকলে", en: "When you have questions" },
    label: { bn: "সহকারীকে জিজ্ঞাসা", en: "Ask the assistant" },
  },
];

export function LandingHero() {
  const reduceMotion = useReducedMotion();
  const ambient = reduceMotion ? undefined : { y: [0, -10, 0], rotate: [0, 1, 0] };

  return (
    <section className="home-hero home-care-hero container" aria-labelledby="home-title">
      <div className="home-hero-copy">
        <div className="eyebrow">
          <Icon name="shield" />
          <BilingualText copy={{ bn: "যেখানেই থাকুন, সহজ ও নিরাপদ দিকনির্দেশনা", en: "Clear, safe guidance wherever you are" }} />
        </div>
        <h1 id="home-title">
          <BilingualText copy={{ bn: "কাশি নিয়ে দুশ্চিন্তা? পরবর্তী নিরাপদ পদক্ষেপটি জানুন।", en: "Worried about a cough? Find your next safe step." }} />
        </h1>
        <p className="lede">
          <BilingualText copy={{ bn: "ফার্স্ট সাইনস আপনাকে প্রাথমিক স্ক্রিনিং থেকে আনুষ্ঠানিক যক্ষ্মা সেবার পথে এগিয়ে যেতে সাহায্য করে।", en: "First Signs helps you move from initial screening toward formal TB care." }} />
        </p>
        <div className="button-row">
          <ActionLink href="/screen?source=self" icon="home" label={{ bn: "বাড়ি থেকে যাচাই করুন", en: "Check from home" }} />
          <ActionLink href="/assistant" variant="secondary" icon="care" label={{ bn: "একটি প্রশ্ন করুন", en: "Ask a question" }} />
        </div>
        <div className="safety-line">
          <Icon name="info" />
          <p>
            <strong><BilingualText copy={{ bn: "এটি যক্ষ্মা রোগ নির্ণয় করে না।", en: "This does not diagnose TB." }} /></strong>{" "}
            <BilingualText copy={{ bn: "প্রস্তাব করা হলে আনুষ্ঠানিক পরীক্ষা প্রয়োজন।", en: "Formal evaluation is required when recommended." }} />
          </p>
        </div>
      </div>

      <div className="care-guidance-stage" aria-label="Care pathway choices">
        <span className="care-guidance-glow care-guidance-glow-one" aria-hidden="true" />
        <span className="care-guidance-glow care-guidance-glow-two" aria-hidden="true" />
        <motion.div
          className="care-guidance-image"
          animate={ambient}
          transition={{ duration: 7, ease: "easeInOut", repeat: Infinity }}
          aria-hidden="true"
        >
          <Image
            src="/healthcare/care-guidance-hero.png"
            width={1600}
            height={1054}
            sizes="(max-width: 47.99rem) 92vw, (max-width: 75rem) 45vw, 34rem"
            priority
            alt=""
          />
        </motion.div>
        <div className="care-guidance-path" aria-hidden="true"><i /><i /><i /></div>
        <div className="care-choice-list">
          {careSteps.map((step, index) => (
            <motion.div
              key={step.href}
              className={`care-choice care-choice-${index + 1}`}
              initial={reduceMotion ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduceMotion ? 0 : 0.18 + index * 0.1, duration: 0.42 }}
              whileHover={reduceMotion ? undefined : { y: -4, scale: 1.015 }}
              whileTap={reduceMotion ? undefined : { scale: 0.985 }}
            >
              <Link href={step.href} className="care-choice-link">
                <span className="care-choice-icon"><Icon name={step.icon} /></span>
                <span>
                  <small><BilingualText copy={step.kicker} /></small>
                  <strong><BilingualText copy={step.label} /></strong>
                </span>
                <Icon name="arrow" />
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
