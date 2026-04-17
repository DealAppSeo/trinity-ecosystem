"use client"

import { Card } from "@/components/ui/card"

export function QRCodeComponent() {
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent("https://www.aisocialmirror.com")}`

  return (
    <Card className="bg-white/[0.03] backdrop-blur-xl border-white/[0.08] rounded-2xl p-6 space-y-4">
      <div className="space-y-3">
        <h3 className="font-heading text-lg font-semibold text-center">Scan to use on mobile</h3>
        <div className="flex justify-center">
          <div className="bg-white p-4 rounded-xl">
            <img
              src={qrCodeUrl || "/placeholder.svg"}
              alt="QR code to access AISocialMirror on mobile"
              width={200}
              height={200}
              className="w-[200px] h-[200px]"
            />
          </div>
        </div>
        <p className="text-sm text-zinc-400 text-center text-pretty">Open this page instantly on your phone</p>
      </div>
    </Card>
  )
}
