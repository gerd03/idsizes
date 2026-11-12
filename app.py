import io
import os
import socket
import uvicorn
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageDraw, ImageOps
import docx
from docx import Document
from docx.shared import Mm, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls

app = FastAPI(title="ID Photo Studio - Print Template Generator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
if os.path.exists(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

# Dimension mappings
CONFIGS = {
    ("a4", "passport"): {
        "paper_w": 210.0, "paper_h": 297.0,
        "margin_top": 13.0, "margin_bot": 13.0, "margin_lr": 17.5,
        "rows": 6, "cols": 5, "cell_w": 35.0, "cell_h": 45.0, "count": 30
    },
    ("a4", "2x2"): {
        "paper_w": 210.0, "paper_h": 297.0,
        "margin_top": 21.0, "margin_bot": 21.0, "margin_lr": 28.8,
        "rows": 5, "cols": 3, "cell_w": 50.8, "cell_h": 50.8, "count": 15
    },
    ("a4", "1x1"): {
        "paper_w": 210.0, "paper_h": 297.0,
        "margin_top": 21.0, "margin_bot": 21.0, "margin_lr": 16.1,
        "rows": 10, "cols": 7, "cell_w": 25.4, "cell_h": 25.4, "count": 70
    },
    ("legal", "passport"): {
        "paper_w": 215.9, "paper_h": 355.6,
        "margin_top": 20.0, "margin_bot": 20.0, "margin_lr": 20.45,
        "rows": 7, "cols": 5, "cell_w": 35.0, "cell_h": 45.0, "count": 35
    },
    ("legal", "2x2"): {
        "paper_w": 215.9, "paper_h": 355.6,
        "margin_top": 25.0, "margin_bot": 25.0, "margin_lr": 31.75,
        "rows": 6, "cols": 3, "cell_w": 50.8, "cell_h": 50.8, "count": 18
    },
    ("legal", "1x1"): {
        "paper_w": 215.9, "paper_h": 355.6,
        "margin_top": 25.0, "margin_bot": 25.0, "margin_lr": 19.05,
        "rows": 12, "cols": 7, "cell_w": 25.4, "cell_h": 25.4, "count": 84
    },
}

def add_table_with_photo(doc, rows, cols, cell_w_mm, cell_h_mm, img_bytes):
    tbl = doc.add_table(rows=rows, cols=cols)
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    tblPr = tbl._tbl.tblPr
    tblPr.append(parse_xml(f'<w:tblLayout {nsdecls("w")} w:type="fixed"/>'))
    tblPr.append(parse_xml(f'<w:tblCellMar {nsdecls("w")}><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar>'))
    
    # 0.5pt subtle gray cut border
    tblBorders = parse_xml(f'''
        <w:tblBorders {nsdecls("w")}>
            <w:top w:val="single" w:sz="4" w:space="0" w:color="A0A0A0"/>
            <w:left w:val="single" w:sz="4" w:space="0" w:color="A0A0A0"/>
            <w:bottom w:val="single" w:sz="4" w:space="0" w:color="A0A0A0"/>
            <w:right w:val="single" w:sz="4" w:space="0" w:color="A0A0A0"/>
            <w:insideH w:val="single" w:sz="4" w:space="0" w:color="A0A0A0"/>
            <w:insideV w:val="single" w:sz="4" w:space="0" w:color="A0A0A0"/>
        </w:tblBorders>
    ''')
    tblPr.append(tblBorders)

    w_dxa = int(round(cell_w_mm * 1440 / 25.4))
    h_dxa = int(round(cell_h_mm * 1440 / 25.4))

    for row in tbl.rows:
        trPr = row._tr.get_or_add_trPr()
        trPr.append(parse_xml(f'<w:trHeight {nsdecls("w")} w:val="{h_dxa}" w:hRule="exact"/>'))
        trPr.append(parse_xml(f'<w:cantSplit {nsdecls("w")}/>'))
        for cell in row.cells:
            tcPr = cell._tc.get_or_add_tcPr()
            tcPr.append(parse_xml(f'<w:tcW {nsdecls("w")} w:w="{w_dxa}" w:type="dxa"/>'))
            tcPr.append(parse_xml(f'<w:vAlign {nsdecls("w")} w:val="center"/>'))
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.line_spacing = 1.0
            
            run = p.add_run()
            img_stream = io.BytesIO(img_bytes)
            run.add_picture(img_stream, width=Mm(cell_w_mm), height=Mm(cell_h_mm))
    return tbl

def build_docx(paper_size, template_type, img_bytes_dict):
    doc = Document()
    sec = doc.sections[0]
    sec.header_distance = Mm(0)
    sec.footer_distance = Mm(0)

    if template_type == "combo":
        if paper_size == "a4":
            sec.page_width = Mm(210.0)
            sec.page_height = Mm(297.0)
            sec.top_margin = Mm(14.0)
            sec.bottom_margin = Mm(14.0)
            sec.left_margin = Mm(15.0)
            sec.right_margin = Mm(15.0)

            # 2x2: 3 cols x 2 rows
            add_table_with_photo(doc, 2, 3, 50.8, 50.8, img_bytes_dict["square"])
            p1 = doc.add_paragraph()
            p1.paragraph_format.space_before = Pt(3)
            p1.paragraph_format.space_after = Pt(3)
            p1.paragraph_format.line_spacing = Pt(2)
            p1.add_run().font.size = Pt(2)

            # Passport: 4 cols x 2 rows
            add_table_with_photo(doc, 2, 4, 35.0, 45.0, img_bytes_dict["passport"])
            p2 = doc.add_paragraph()
            p2.paragraph_format.space_before = Pt(3)
            p2.paragraph_format.space_after = Pt(3)
            p2.paragraph_format.line_spacing = Pt(2)
            p2.add_run().font.size = Pt(2)

            # 1x1: 6 cols x 2 rows
            add_table_with_photo(doc, 2, 6, 25.4, 25.4, img_bytes_dict["square"])

        else: # legal combo
            sec.page_width = Mm(215.9)
            sec.page_height = Mm(355.6)
            sec.top_margin = Mm(20.0)
            sec.bottom_margin = Mm(20.0)
            sec.left_margin = Mm(18.0)
            sec.right_margin = Mm(18.0)

            # 2x2: 3 cols x 3 rows = 9 pcs
            add_table_with_photo(doc, 3, 3, 50.8, 50.8, img_bytes_dict["square"])
            p1 = doc.add_paragraph()
            p1.paragraph_format.space_before = Pt(3)
            p1.paragraph_format.space_after = Pt(3)
            p1.paragraph_format.line_spacing = Pt(2)
            p1.add_run().font.size = Pt(2)

            # Passport: 4 cols x 2 rows = 8 pcs
            add_table_with_photo(doc, 2, 4, 35.0, 45.0, img_bytes_dict["passport"])
            p2 = doc.add_paragraph()
            p2.paragraph_format.space_before = Pt(3)
            p2.paragraph_format.space_after = Pt(3)
            p2.paragraph_format.line_spacing = Pt(2)
            p2.add_run().font.size = Pt(2)

            # 1x1: 6 cols x 2 rows = 12 pcs
            add_table_with_photo(doc, 2, 6, 25.4, 25.4, img_bytes_dict["square"])

    else:
        cfg = CONFIGS.get((paper_size, template_type))
        if not cfg:
            raise ValueError(f"Unknown config: {paper_size}, {template_type}")

        sec.page_width = Mm(cfg["paper_w"])
        sec.page_height = Mm(cfg["paper_h"])
        sec.top_margin = Mm(cfg["margin_top"])
        sec.bottom_margin = Mm(cfg["margin_bot"])
        sec.left_margin = Mm(cfg["margin_lr"])
        sec.right_margin = Mm(cfg["margin_lr"])

        img_key = "passport" if template_type == "passport" else "square"
        add_table_with_photo(doc, cfg["rows"], cfg["cols"], cfg["cell_w"], cfg["cell_h"], img_bytes_dict[img_key])

    # Trailing 1pt paragraph to prevent page spill
    p_end = doc.add_paragraph()
    p_end.paragraph_format.space_before = Pt(0)
    p_end.paragraph_format.space_after = Pt(0)
    p_end.paragraph_format.line_spacing = Pt(1)
    p_end.add_run().font.size = Pt(1)

    out_buf = io.BytesIO()
    doc.save(out_buf)
    return out_buf.getvalue()

def build_pdf(paper_size, template_type, img_dict, guide_style="both"):
    dpi = 300
    if template_type == "combo":
        if paper_size == "a4":
            pw, ph = 210.0, 297.0
            sections = [
                {"rows": 2, "cols": 3, "cw": 50.8, "ch": 50.8, "x": 28.8, "y": 14.0, "img": img_dict["square"]},
                {"rows": 2, "cols": 4, "cw": 35.0, "ch": 45.0, "x": 35.0, "y": 119.6, "img": img_dict["passport"]},
                {"rows": 2, "cols": 6, "cw": 25.4, "ch": 25.4, "x": 28.8, "y": 213.6, "img": img_dict["square"]},
            ]
        else: # legal
            pw, ph = 215.9, 355.6
            sections = [
                {"rows": 3, "cols": 3, "cw": 50.8, "ch": 50.8, "x": 31.75, "y": 20.0, "img": img_dict["square"]},
                {"rows": 2, "cols": 4, "cw": 35.0, "ch": 45.0, "x": 37.95, "y": 177.4, "img": img_dict["passport"]},
                {"rows": 2, "cols": 6, "cw": 25.4, "ch": 25.4, "x": 31.75, "y": 272.4, "img": img_dict["square"]},
            ]
    else:
        cfg = CONFIGS.get((paper_size, template_type))
        if not cfg:
            raise ValueError(f"Unknown config: {paper_size}, {template_type}")
        pw, ph = cfg["paper_w"], cfg["paper_h"]
        img_key = "passport" if template_type == "passport" else "square"
        sections = [{
            "rows": cfg["rows"], "cols": cfg["cols"],
            "cw": cfg["cell_w"], "ch": cfg["cell_h"],
            "x": cfg["margin_lr"], "y": cfg["margin_top"],
            "img": img_dict[img_key]
        }]

    sheet_w = int(round(pw / 25.4 * dpi))
    sheet_h = int(round(ph / 25.4 * dpi))
    sheet = Image.new("RGB", (sheet_w, sheet_h), (255, 255, 255))
    draw = ImageDraw.Draw(sheet)

    for sec in sections:
        cw_px = int(round(sec["cw"] / 25.4 * dpi))
        ch_px = int(round(sec["ch"] / 25.4 * dpi))
        x0_px = int(round(sec["x"] / 25.4 * dpi))
        y0_px = int(round(sec["y"] / 25.4 * dpi))

        resized_photo = sec["img"].resize((cw_px, ch_px), Image.Resampling.LANCZOS)

        for r in range(sec["rows"]):
            for c in range(sec["cols"]):
                cx = x0_px + c * cw_px
                cy = y0_px + r * ch_px
                sheet.paste(resized_photo, (cx, cy))

                if guide_style in ("lines", "both"):
                    draw.rectangle([cx, cy, cx + cw_px, cy + ch_px], outline=(170, 170, 170), width=2)
                
                if guide_style in ("marks", "both"):
                    tick = 12
                    draw.line([(cx - tick, cy), (cx, cy)], fill=(110, 110, 110), width=2)
                    draw.line([(cx, cy - tick), (cx, cy)], fill=(110, 110, 110), width=2)
                    draw.line([(cx + cw_px, cy + ch_px), (cx + cw_px + tick, cy + ch_px)], fill=(110, 110, 110), width=2)
                    draw.line([(cx + cw_px, cy + ch_px), (cx + cw_px, cy + ch_px + tick)], fill=(110, 110, 110), width=2)

    buf = io.BytesIO()
    sheet.save(buf, "PDF", resolution=300.0)
    return buf.getvalue()

@app.api_route("/", methods=["GET", "HEAD"])
def get_root():
    index_file = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return HTMLResponse("<h2>ID Photo Studio Server Running</h2><p>Static files missing.</p>")

@app.api_route("/api/info", methods=["GET"])
@app.api_route("/info", methods=["GET"])
def get_info():
    return {
        "status": "ready",
        "local_ip": get_local_ip(),
        "configs": {
            "a4": {
                "passport": {"photos": 30, "size": "35x45mm"},
                "2x2": {"photos": 15, "size": "2x2 in"},
                "1x1": {"photos": 70, "size": "1x1 in"},
                "combo": {"photos": 26, "desc": "6 of 2x2 + 8 of Passport + 12 of 1x1"}
            },
            "legal": {
                "passport": {"photos": 35, "size": "35x45mm"},
                "2x2": {"photos": 18, "size": "2x2 in"},
                "1x1": {"photos": 84, "size": "1x1 in"},
                "combo": {"photos": 29, "desc": "9 of 2x2 + 8 of Passport + 12 of 1x1"}
            }
        }
    }

@app.api_route("/api/generate", methods=["POST"])
@app.api_route("/generate", methods=["POST"])
async def generate_sheet(
    image: UploadFile = File(...),
    paper_size: str = Form("a4"),
    template_type: str = Form("passport"),
    format: str = Form("pdf"),
    guide_style: str = Form("both"),
    # optional manual crop ratios from client
    crop_x: float = Form(0.0),
    crop_y: float = Form(0.0),
    crop_w: float = Form(1.0),
    crop_h: float = Form(1.0),
):
    try:
        raw_bytes = await image.read()
        pil_img = Image.open(io.BytesIO(raw_bytes))
        pil_img = ImageOps.exif_transpose(pil_img) # fix mobile camera orientation!
        if pil_img.mode != "RGB":
            pil_img = pil_img.convert("RGB")

        # Apply crop if coordinates provided
        img_w, img_h = pil_img.size
        if crop_w > 0 and crop_h > 0 and (crop_w < 0.999 or crop_h < 0.999 or crop_x > 0.001 or crop_y > 0.001):
            left = max(0, int(crop_x * img_w))
            top = max(0, int(crop_y * img_h))
            right = min(img_w, int((crop_x + crop_w) * img_w))
            bottom = min(img_h, int((crop_y + crop_h) * img_h))
            cropped_source = pil_img.crop((left, top, right, bottom))
        else:
            cropped_source = pil_img

        # Prepare 35:45 and 1:1 versions
        # 1. Square (1:1)
        src_w, src_h = cropped_source.size
        sq_size = min(src_w, src_h)
        sq_left = (src_w - sq_size) // 2
        sq_top = (src_h - sq_size) // 2
        img_square = cropped_source.crop((sq_left, sq_top, sq_left + sq_size, sq_top + sq_size))

        # 2. Passport (35:45 -> 7:9)
        target_ratio = 35.0 / 45.0
        current_ratio = src_w / src_h
        if current_ratio > target_ratio:
            # wider than passport, crop sides
            p_w = int(round(src_h * target_ratio))
            p_left = (src_w - p_w) // 2
            img_passport = cropped_source.crop((p_left, 0, p_left + p_w, src_h))
        else:
            # taller than passport, crop top/bottom
            p_h = int(round(src_w / target_ratio))
            p_top = (src_h - p_h) // 2
            img_passport = cropped_source.crop((0, p_top, src_w, p_top + p_h))

        img_dict = {"passport": img_passport, "square": img_square}

        # Convert to in-memory JPEG bytes for DOCX
        buf_p = io.BytesIO()
        img_passport.save(buf_p, format="JPEG", quality=95)
        buf_sq = io.BytesIO()
        img_square.save(buf_sq, format="JPEG", quality=95)
        img_bytes_dict = {"passport": buf_p.getvalue(), "square": buf_sq.getvalue()}

        paper_size = paper_size.lower()
        template_type = template_type.lower()
        format = format.lower()

        filename_prefix = f"PhotoPrint_{paper_size.upper()}_{template_type.title()}"

        if format == "docx":
            data = build_docx(paper_size, template_type, img_bytes_dict)
            media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            filename = f"{filename_prefix}.docx"
        else:
            data = build_pdf(paper_size, template_type, img_dict, guide_style)
            media_type = "application/pdf"
            filename = f"{filename_prefix}.pdf"

        return Response(
            content=data,
            media_type=media_type,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    local_ip = get_local_ip()
    print("========================================================")
    print("  ID Photo Studio Web App")
    print(f"  Local PC:       http://localhost:8000")
    print(f"  Mobile Network: http://{local_ip}:8000")
    print("========================================================")
    uvicorn.run(app, host="0.0.0.0", port=8000)
