"""Immutable PDF snapshot of a calculated packing analysis."""
from io import BytesIO
from typing import Any
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle


def render_analysis_pdf(order: dict[str, Any]) -> bytes:
    result = order["plan"]["result"]
    stream = BytesIO()
    document = SimpleDocTemplate(stream, pagesize=A4, rightMargin=1.6*cm,
                                 leftMargin=1.6*cm, topMargin=1.7*cm, bottomMargin=1.7*cm,
                                 title=f"PackFlow - {order['order_number']}", author="PackFlow")
    styles = getSampleStyleSheet()
    styles["Heading2"].keepWithNext = True
    styles.add(ParagraphStyle(name="Cell", fontName="Helvetica", fontSize=8,
                              leading=11, spaceAfter=0))
    styles.add(ParagraphStyle(name="SmallNote", fontSize=8, leading=11,
                              textColor=colors.HexColor("#526174")))
    navy = colors.HexColor("#142537")
    styles.add(ParagraphStyle(name="HeaderCell", parent=styles["Cell"],
                              textColor=colors.white, fontName="Helvetica-Bold"))

    def para(value: Any, style: str = "Cell") -> Paragraph:
        return Paragraph(escape(str(value if value is not None else "Pending")).replace("\n", "<br/>"), styles[style])

    def table(rows: list[list[Any]], widths: list[float]) -> Table:
        data = [[para(cell, "HeaderCell" if index == 0 else "Cell") for cell in row]
                for index, row in enumerate(rows)]
        block = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
        block.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), navy),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F0F4F7")]),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ("LINEBELOW", (0, 0), (-1, 0), 0.6, navy),
        ]))
        return block

    width = document.width
    story = [para("PACKFLOW", "Title"), para("Final packing analysis", "Heading1"),
             para(f"Order {order['order_number']} | Plan #{order['plan']['id']}", "Heading2")]
    info = [("Customer", order["client"]), ("Supplier", order["vendor"] or "Pending"),
            ("Order date", order["order_date"]), ("Requested date", order["requested_date"]),
            ("Delivery address", order["delivery_address"] or "Pending"),
            ("Calculated", order["plan"]["created_at"]), ("Currency", order["currency"])]
    story.append(table([["Field", "Value"], *info], [width*.27, width*.73]))
    story.extend([Spacer(1, 12), para("Result", "Heading2"),
                  table([["Boxes", "Units", "Utilization", "Gross weight", "Available space"],
                         [result["box_count"], result["unit_count"], f"{result['average_utilization']}%",
                          f"{result['total_weight_kg']} kg",
                          f"{sum(b['remaining_volume_l'] for b in result['boxes']):.2f} L"]], [width/5]*5),
                  Spacer(1, 12), para("Order products", "Heading2")])
    rows = [["Product", "Type", "Quantity", "Price", "Amount"]]
    for item in order["items"]:
        rows.append([item["description"], "Additional" if item["is_suggested"] else "Original",
                     item["quantity"], f"{item['unit_price']:.2f}" if item["unit_price"] else "Pending",
                     f"{item['amount']:.2f}" if item["unit_price"] else "Pending"])
    story.append(table(rows, [width*.43, width*.17, width*.12, width*.14, width*.14]))
    story.append(para(f"Subtotal: {order['subtotal']:.2f} | Taxes: {order['tax_amount']:.2f} | Recorded total: {order['total_amount']:.2f} {order['currency']}", "SmallNote"))
    if any(not item["unit_price"] for item in order["items"]):
        story.append(para("Some prices are missing; the recorded total is provisional.", "SmallNote"))
    for box in result["boxes"]:
        story.extend([Spacer(1, 14), para(f"Box {box['sequence']} - {box['box_code']}", "Heading2"),
                      para(f"Dimensions: {' x '.join(str(v) for v in box['dimensions_cm'])} cm | Utilization: {box['utilization']}% | Weight: {box['gross_weight_kg']} / {box['max_weight_kg']} kg | Available: {box['remaining_volume_l']} L", "SmallNote"),
                      Spacer(1, 6), table([["Product", "Quantity"],
                          *[[i["name"], i["quantity"]] for i in box["items"]]], [width*.8, width*.2])])
        placement_rows = [["Unit / product", "Position x, y, z (cm)", "Dimensions (cm)"]]
        for p in box["placements"]:
            placement_rows.append([f"{p['uid']} / {p['name']}",
                                   ", ".join(f"{v:g}" for v in p["position"]),
                                   " x ".join(f"{v:g}" for v in p["dimensions"])])
        story.extend([Spacer(1, 6), table(placement_rows, [width*.5, width*.25, width*.25])])
    story.extend([Spacer(1, 12), para("Recommendations", "Heading2")])
    for suggestion in result["suggestions"]:
        story.append(para(f"{suggestion['title']}: {suggestion['detail']}", "BodyText"))
    for rec in result.get("product_recommendations", []):
        story.append(para(f"Alternative: add {rec['quantity']} of {rec['description']}. Projected utilization: {rec['projected_utilization']}%. Recalculate after applying each alternative.", "BodyText"))
    story.extend([Spacer(1, 10), para(result["method"], "SmallNote"),
                  para("The 3D search is bounded: it selects the least remaining space among the evaluated plans and does not guarantee a global mathematical optimum.", "SmallNote")])
    if order["notes"]:
        story.extend([para("Notes and source", "Heading2"), para(order["notes"], "BodyText")])

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor("#526174"))
        canvas.drawString(document.leftMargin, 1*cm, "PackFlow | Packing analysis")
        canvas.drawRightString(A4[0] - document.rightMargin, 1*cm, f"Page {doc.page}")
        canvas.restoreState()

    document.build(story, onFirstPage=footer, onLaterPages=footer)
    return stream.getvalue()
