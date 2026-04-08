import requests

BASE_URL = "http://localhost:4000/api"
TIMEOUT = 30

def login(email, password):
    url = f"{BASE_URL}/auth/login"
    resp = requests.post(url, json={"email": email, "password": password}, timeout=TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    token = data.get("token")
    assert token, "Login failed, no token received"
    return token

def get_first_line_id(token):
    url = f"{BASE_URL}/lines"
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(url, headers=headers, timeout=TIMEOUT)
    resp.raise_for_status()
    lines = resp.json()
    assert isinstance(lines, list) and len(lines) > 0, "No lines found"
    first_line_id = lines[0].get("id")
    assert first_line_id, "Line id not found in the first line"
    return first_line_id

def create_checklist(token, line_id):
    url = f"{BASE_URL}/checklists"
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"lineId": line_id}
    resp = requests.post(url, json=payload, headers=headers, timeout=TIMEOUT)
    resp.raise_for_status()
    checklist = resp.json()
    checklist_id = checklist.get("id")
    assert checklist_id, "Checklist creation response missing id"
    return checklist_id

def submit_checklist(token, checklist_id):
    url = f"{BASE_URL}/checklists/{checklist_id}/submit"
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.post(url, headers=headers, timeout=TIMEOUT)
    resp.raise_for_status()
    submitted_checklist = resp.json()
    assert submitted_checklist.get("status") == "submitted", "Checklist status is not 'submitted'"
    return submitted_checklist

def export_pdf(token, checklist_id):
    url = f"{BASE_URL}/checklists/{checklist_id}/pdf"
    headers = {"Authorization": f"Bearer {token}"}
    return requests.get(url, headers=headers, timeout=TIMEOUT)

def delete_checklist(token, checklist_id):
    url = f"{BASE_URL}/checklists/{checklist_id}"
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.delete(url, headers=headers, timeout=TIMEOUT)
    # Could be 204 or 404 if already deleted, so no raise_for_status here
    return resp

def test_get_api_checklists_pdf_export_checklist_as_pdf():
    operator_email = "gsanchez@gallo.com"
    operator_pass = "operator123"
    admin_email = "ymartinez@gallo.com"
    admin_pass = "admin123"

    operator_token = login(operator_email, operator_pass)
    first_line_id = get_first_line_id(operator_token)

    checklist_id = None
    try:
        checklist_id = create_checklist(operator_token, first_line_id)
        submit_checklist(operator_token, checklist_id)

        admin_token = login(admin_email, admin_pass)

        # Admin exports PDF, expect 200 and content-type application/pdf
        admin_pdf_resp = export_pdf(admin_token, checklist_id)
        assert admin_pdf_resp.status_code == 200, f"Expected 200 but got {admin_pdf_resp.status_code}"
        content_type = admin_pdf_resp.headers.get("Content-Type", "")
        assert "application/pdf" in content_type.lower(), f"Unexpected content-type: {content_type}"

        # Operator tries to export PDF, expect 403 Forbidden
        operator_pdf_resp = export_pdf(operator_token, checklist_id)
        assert operator_pdf_resp.status_code == 403, f"Expected 403 but got {operator_pdf_resp.status_code}"

        # Admin tries to export PDF for non-existent checklist, expect 404
        non_existent_id = "000000000000000000000000"  # assuming this id does not exist
        non_exist_resp = export_pdf(admin_token, non_existent_id)
        assert non_exist_resp.status_code == 404, f"Expected 404 but got {non_exist_resp.status_code}"

    finally:
        if checklist_id:
            admin_token = login(admin_email, admin_pass)
            delete_resp = delete_checklist(admin_token, checklist_id)
            assert delete_resp.status_code in (204, 404), f"Delete checklist failed with status {delete_resp.status_code}"

test_get_api_checklists_pdf_export_checklist_as_pdf()