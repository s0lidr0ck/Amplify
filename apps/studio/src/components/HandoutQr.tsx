import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * The QR code on a printed handout.
 *
 * Drawn in the browser rather than stored, the same way Link draws it on its
 * own campaigns screen: the code is a pure function of the URL, so a saved
 * copy could only ever go stale.
 *
 * The settings are the ones that survive a church office. High error
 * correction because these get photocopied, folded into a Bible, and
 * scanned in bad light at arm's length; pure black on white because the
 * sheet is printed on whatever is in the tray. An <img> rather than a CSS
 * background, deliberately — browsers drop background fills when printing
 * unless asked twice, which is the same reason the rest of the sheet is
 * built from rules and type.
 */
export function HandoutQr({
  url,
  className,
  caption,
}: {
  url: string;
  className?: string;
  /** A line telling somebody what scanning it will do. */
  caption?: string;
}) {
  const [png, setPng] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void QRCode.toDataURL(url, {
      margin: 1,
      width: 512,
      errorCorrectionLevel: "H",
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then((data) => {
        if (alive) setPng(data);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [url]);

  // Nothing at all until it is drawn, rather than a grey placeholder box.
  // Somebody may press Print the moment the page settles, and an empty
  // square where a code should be is worse than a sheet that never promised
  // one.
  if (!png) return null;

  return (
    <div className={`sheet-qr ${className ?? ""}`}>
      <img src={png} alt={`QR code linking to ${url}`} />
      {caption && <p className="sheet-qr-caption">{caption}</p>}
    </div>
  );
}
