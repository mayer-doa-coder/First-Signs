"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { BilingualText } from "@/components/language";
import { ActionLink, ClayCard, StatusPill } from "@/components/ui";
import {
  getPharmacyScreeningPath,
  type DemoPharmacy,
} from "@/lib/pharmacies";

export function PharmacyQrCard({
  pharmacy,
  qrBaseUrl,
  messagingLinks,
}: {
  pharmacy: DemoPharmacy;
  qrBaseUrl: string;
  messagingLinks?: { whatsapp: string | null; telegram: string | null };
}) {
  const entryPath = useMemo(
    () => getPharmacyScreeningPath(pharmacy.id),
    [pharmacy.id],
  );
  const [qrCode, setQrCode] = useState<{ source: string; value: string }>();
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    Promise.resolve()
      .then(async () => {
        const absoluteEntryUrl = new URL(entryPath, qrBaseUrl).toString();
        const dataUrl = await QRCode.toDataURL(absoluteEntryUrl, {
          errorCorrectionLevel: "M",
          margin: 2,
          width: 256,
          color: { dark: "#102f2d", light: "#ffffff" },
        });
        return { source: dataUrl, value: absoluteEntryUrl };
      })
      .then((nextQrCode) => {
        if (isCurrent) setQrCode(nextQrCode);
      })
      .catch(() => {
        if (isCurrent) setHasError(true);
      });

    return () => {
      isCurrent = false;
    };
  }, [entryPath, qrBaseUrl]);

  return (
    <ClayCard className="pharmacy-qr-card" as="article">
      <div className="pharmacy-qr-heading">
        <div>
          <StatusPill
            tone="success"
            icon="pharmacy"
            label={{ bn: "সক্রিয় ডেমো ফার্মেসি", en: "Active demo pharmacy" }}
          />
          <h3><BilingualText copy={pharmacy.name} /></h3>
          <p><BilingualText copy={pharmacy.area} /></p>
        </div>
        <code className="pharmacy-id" lang="en">{pharmacy.id}</code>
      </div>

      <div className="qr-surface" aria-live="polite">
        {qrCode ? (
          <Image
            className="qr-image"
            src={qrCode.source}
            alt={`${pharmacy.name.bn} / ${pharmacy.name.en} — ${pharmacy.id} QR code`}
            width={256}
            height={256}
            unoptimized
            data-qr-value={qrCode.value}
          />
        ) : hasError ? (
          <p role="alert"><BilingualText copy={{ bn: "QR কোড তৈরি করা যায়নি। নিচের লিংক ব্যবহার করুন।", en: "The QR code could not be generated. Use the link below." }} /></p>
        ) : (
          <p><BilingualText copy={{ bn: "QR কোড তৈরি হচ্ছে…", en: "Generating QR code…" }} /></p>
        )}
      </div>

      <p className="qr-helper">
        <BilingualText copy={{ bn: "স্ক্যান করলে এই ফার্মেসির পরিচয়সহ সহায়তাপ্রাপ্ত স্ক্রিনিং খুলবে।", en: "Scanning opens an assisted screening linked to this pharmacy." }} />
      </p>
      <ActionLink
        href={entryPath}
        variant="secondary"
        icon="pharmacy"
        label={{ bn: "ফার্মেসির সহায়তায় যাচাই করুন", en: "Pharmacy-assisted check" }}
      />
      {(messagingLinks?.whatsapp || messagingLinks?.telegram) && (
        <div className="pharmacy-message-links" aria-label="মেসেজিং চ্যানেল / Messaging channels">
          {messagingLinks.whatsapp && (
            <ActionLink
              href={messagingLinks.whatsapp}
              variant="quiet"
              icon="screen"
              label={{ bn: "WhatsApp-এ শুরু করুন", en: "Start in WhatsApp" }}
            />
          )}
          {messagingLinks.telegram && (
            <ActionLink
              href={messagingLinks.telegram}
              variant="quiet"
              icon="screen"
              label={{ bn: "Telegram-এ শুরু করুন", en: "Start in Telegram" }}
            />
          )}
        </div>
      )}
    </ClayCard>
  );
}
