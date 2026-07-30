// Renders the ParkFree Sydney app icon (1024×1024 PNG).
// Run:  swift scripts/make-icon.swift assets/icon.png
import AppKit

let size = CGSize(width: 1024, height: 1024)
let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "assets/icon.png"

let image = NSImage(size: size)
image.lockFocus()
guard let ctx = NSGraphicsContext.current?.cgContext else { fatalError("no context") }

// Background: deep night-blue vertical gradient
let bgColors = [
    NSColor(calibratedRed: 0.075, green: 0.09, blue: 0.12, alpha: 1).cgColor,
    NSColor(calibratedRed: 0.045, green: 0.055, blue: 0.08, alpha: 1).cgColor,
]
let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
                          colors: bgColors as CFArray, locations: [0, 1])!
ctx.drawLinearGradient(gradient, start: CGPoint(x: 0, y: size.height),
                       end: CGPoint(x: 0, y: 0), options: [])

// Faint street grid (rotated) — echoes the map
ctx.saveGState()
ctx.translateBy(x: size.width / 2, y: size.height / 2)
ctx.rotate(by: -0.28)
ctx.translateBy(x: -size.width / 2, y: -size.height / 2)
ctx.setLineWidth(6)
ctx.setStrokeColor(NSColor(calibratedWhite: 1, alpha: 0.05).cgColor)
var offset: CGFloat = -400
while offset < 1400 {
    ctx.move(to: CGPoint(x: offset, y: -200)); ctx.addLine(to: CGPoint(x: offset, y: 1224))
    ctx.move(to: CGPoint(x: -200, y: offset)); ctx.addLine(to: CGPoint(x: 1224, y: offset))
    offset += 148
}
ctx.strokePath()
// One highlighted "free street" running through the grid
ctx.setLineWidth(22)
ctx.setLineCap(.round)
ctx.setStrokeColor(NSColor(calibratedRed: 0.2, green: 0.78, blue: 0.6, alpha: 0.35).cgColor)
ctx.move(to: CGPoint(x: -100, y: 268))
ctx.addLine(to: CGPoint(x: 1124, y: 268))
ctx.strokePath()
ctx.restoreGState()

// Rounded-square badge behind the P
let badgeRect = CGRect(x: 232, y: 232, width: 560, height: 560)
let badge = CGPath(roundedRect: badgeRect, cornerWidth: 132, cornerHeight: 132, transform: nil)
ctx.addPath(badge)
ctx.setFillColor(NSColor(calibratedRed: 0.204, green: 0.827, blue: 0.6, alpha: 1).cgColor) // #34D399
ctx.fillPath()

// The "P"
let paragraph = NSMutableParagraphStyle()
paragraph.alignment = .center
let font = NSFont.systemFont(ofSize: 430, weight: .heavy)
let attrs: [NSAttributedString.Key: Any] = [
    .font: font,
    .foregroundColor: NSColor(calibratedRed: 0.016, green: 0.16, blue: 0.106, alpha: 1), // #04291B
    .paragraphStyle: paragraph,
]
let p = NSAttributedString(string: "P", attributes: attrs)
let textSize = p.size()
p.draw(at: CGPoint(x: (size.width - textSize.width) / 2,
                   y: (size.height - textSize.height) / 2 + 8))

// "FREE" wordmark under the badge
let smallFont = NSFont.systemFont(ofSize: 96, weight: .heavy)
let small = NSAttributedString(string: "F R E E", attributes: [
    .font: smallFont,
    .foregroundColor: NSColor(calibratedRed: 0.204, green: 0.827, blue: 0.6, alpha: 1),
    .paragraphStyle: paragraph,
])
let smallSize = small.size()
small.draw(at: CGPoint(x: (size.width - smallSize.width) / 2, y: 96))

image.unlockFocus()

guard let tiff = image.tiffRepresentation,
      let rep = NSBitmapImageRep(data: tiff),
      let png = rep.representation(using: .png, properties: [:]) else {
    fatalError("failed to encode png")
}
// Force 1024×1024 pixels regardless of screen scale
rep.size = size
try! png.write(to: URL(fileURLWithPath: out))
print("wrote \(out) (\(rep.pixelsWide)x\(rep.pixelsHigh))")
