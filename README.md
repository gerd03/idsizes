# ID Photo Studio - Auto-Grid Print Master

A modern, high-precision mobile-responsive web application to arrange and print passport and ID photos on standard **A4** and **US Legal** paper formats with zero distortion and official cutting guide lines.

## ✨ Features
- **Official ID Standards:**
  - **Passport:** 35 × 45 mm (30 photos on A4, 35 on Legal)
  - **2 × 2 Inch:** 50.8 × 50.8 mm (15 photos on A4, 15 on Legal)
  - **1 × 1 Inch:** 25.4 × 25.4 mm (70 photos on A4, 84 on Legal)
  - **Combo Pack:** Mixed official bundle (4× 2x2, 8× Passport, 14× 1x1 on A4 = 26 photos)
- **High Precision Grid Calculation:**
  - 100% strict physical mm/inch dimensions with safe printable margins (>13mm).
  - Subtle 0.5pt cut marks and crosshair alignment guides for easy scissor trimming.
- **Dual Export Engine:**
  - **PDF:** 300 DPI high-resolution CMYK/RGB print-ready document.
  - **DOCX:** Native Microsoft Word document with zero-margin tables and fixed cell heights.
- **Interactive Biometric Crop Tool:**
  - Touch-friendly pan, zoom, 90° rotation, and biometric facial proportion guides.
- **Modern Tactile UI/UX:**
  - 3D interactive tilt physics, haptic vibrations (`navigator.vibrate`), responsive floating action dock, and print dialog checklists.

## 🚀 Deployment (Vercel)
This app is ready for 1-click deployment on [Vercel](https://vercel.com):
1. Import this repository in Vercel.
2. Vercel automatically detects the FastAPI configuration via `vercel.json` and `requirements.txt`.
3. Deploy!

## 💻 Local Development
```bash
# Clone the repository
git clone https://github.com/gerd03/idsizes.git
cd idsizes

# Install dependencies
pip install -r requirements.txt

# Run the development server
python app.py
```
Open [http://localhost:8000](http://localhost:8000) in your browser.
