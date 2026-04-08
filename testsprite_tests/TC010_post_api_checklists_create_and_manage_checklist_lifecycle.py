import requests

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

ADMIN_EMAIL = "ymartinez@gallo.com"
ADMIN_PASSWORD = "admin123"
OPERATOR_EMAIL = "gsanchez@gallo.com"
OPERATOR_PASSWORD = "operator123"

def login(email, password):
    url = f"{BASE_URL}/api/auth/login"
    payload = {"email": email, "password": password}
    resp = requests.post(url, json=payload, timeout=TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    token = data.get("token")
    assert token, "Token not received in login response"
    return token

def get_lines(token):
    url = f"{BASE_URL}/api/lines"
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(url, headers=headers, timeout=TIMEOUT)
    resp.raise_for_status()
    return resp.json()

def create_checklist(operator_token, line_id):
    url = f"{BASE_URL}/api/checklists"
    headers = {"Authorization": f"Bearer {operator_token}"}
    payload = {"lineId": line_id}
    resp = requests.post(url, json=payload, headers=headers, timeout=TIMEOUT)
    return resp

def update_checklist_items(operator_token, checklist_id, machines):
    url = f"{BASE_URL}/api/checklists/{checklist_id}/items"
    headers = {"Authorization": f"Bearer {operator_token}"}
    payload = {"machines": machines}
    resp = requests.put(url, json=payload, headers=headers, timeout=TIMEOUT)
    return resp

def submit_checklist(operator_token, checklist_id):
    url = f"{BASE_URL}/api/checklists/{checklist_id}/submit"
    headers = {"Authorization": f"Bearer {operator_token}"}
    resp = requests.post(url, headers=headers, timeout=TIMEOUT)
    return resp

def approve_checklist(admin_token, checklist_id):
    url = f"{BASE_URL}/api/checklists/{checklist_id}/approve"
    headers = {"Authorization": f"Bearer {admin_token}"}
    resp = requests.post(url, headers=headers, timeout=TIMEOUT)
    return resp

def deny_checklist(admin_token, checklist_id):
    url = f"{BASE_URL}/api/checklists/{checklist_id}/deny"
    headers = {"Authorization": f"Bearer {admin_token}"}
    resp = requests.post(url, headers=headers, timeout=TIMEOUT)
    return resp

def delete_checklist(admin_token, checklist_id):
    url = f"{BASE_URL}/api/checklists/{checklist_id}"
    headers = {"Authorization": f"Bearer {admin_token}"}
    resp = requests.delete(url, headers=headers, timeout=TIMEOUT)
    return resp

def export_checklist_pdf(token, checklist_id):
    url = f"{BASE_URL}/api/checklists/{checklist_id}/pdf"
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(url, headers=headers, timeout=TIMEOUT)
    return resp

def test_post_api_checklists_create_and_manage_checklist_lifecycle():
    # Login as admin and operator
    admin_token = login(ADMIN_EMAIL, ADMIN_PASSWORD)
    operator_token = login(OPERATOR_EMAIL, OPERATOR_PASSWORD)

    # Fetch production lines with operator token
    lines = get_lines(operator_token)
    assert isinstance(lines, list) and len(lines) > 0, "No production lines found"
    valid_line = lines[0]
    line_id = valid_line.get("id") or valid_line.get("_id") or valid_line.get("lineId") or valid_line.get("id")
    assert line_id, "No lineId available from production lines"

    checklist_id = None
    try:
        # Create checklist with valid lineId and operator token (expect 201)
        resp_create = create_checklist(operator_token, line_id)
        assert resp_create.status_code == 201, f"Expected 201, got {resp_create.status_code}"
        checklist = resp_create.json()
        checklist_id = checklist.get("id") or checklist.get("_id")
        assert checklist_id, "Checklist ID not found in creation response"

        # Try create checklist with invalid lineId (expect 404)
        resp_invalid_line = create_checklist(operator_token, "invalid-line-id-xyz")
        assert resp_invalid_line.status_code == 404
        assert "Line not found" in resp_invalid_line.text or "User not found" in resp_invalid_line.text

        # To test 400 No template available, create checklist with a lineId that likely has no template
        # We attempt to find such lineId by filtering lines. If none found, we skip this test.
        line_with_no_template = None
        # fake or uncommon lineId, different from valid_line
        for line in lines:
            lid = line.get("id") or line.get("_id") or line.get("lineId")
            if lid != line_id:
                line_with_no_template = lid
                break
        if line_with_no_template:
            resp_no_template = create_checklist(operator_token, line_with_no_template)
            if resp_no_template.status_code == 400:
                assert "No template available" in resp_no_template.text
            elif resp_no_template.status_code == 201:
                # If template exists, delete created checklist to keep data clean
                new_id = resp_no_template.json().get("id") or resp_no_template.json().get("_id")
                if new_id:
                    delete_checklist(admin_token, new_id)
            else:
                # unexpected status, fail test
                assert False, f"Unexpected status code for no template test: {resp_no_template.status_code}"

        # Update checklist items (machines array)
        machines_payload = [{"machineId": "m1", "cleaned": True, "notes": "Test clean"}]
        resp_update = update_checklist_items(operator_token, checklist_id, machines_payload)
        assert resp_update.status_code == 200, f"Expected 200 on update, got {resp_update.status_code}"
        updated_checklist = resp_update.json()
        assert "machines" in updated_checklist and isinstance(updated_checklist["machines"], list)

        # Submit checklist
        resp_submit = submit_checklist(operator_token, checklist_id)
        assert resp_submit.status_code == 200
        submitted_checklist = resp_submit.json()
        assert submitted_checklist.get("status") == "submitted"

        # Approve checklist with admin token
        resp_approve = approve_checklist(admin_token, checklist_id)
        assert resp_approve.status_code == 200
        approved_checklist = resp_approve.json()
        assert approved_checklist.get("status") == "approved"

        # Re-create a checklist for deny test
        resp_create2 = create_checklist(operator_token, line_id)
        assert resp_create2.status_code == 201
        checklist2 = resp_create2.json()
        checklist2_id = checklist2.get("id") or checklist2.get("_id")
        assert checklist2_id

        # Submit the second checklist
        resp_submit2 = submit_checklist(operator_token, checklist2_id)
        assert resp_submit2.status_code == 200
        submitted_checklist2 = resp_submit2.json()
        assert submitted_checklist2.get("status") == "submitted"

        # Deny checklist with admin token
        resp_deny = deny_checklist(admin_token, checklist2_id)
        assert resp_deny.status_code == 200
        denied_checklist = resp_deny.json()
        assert denied_checklist.get("status") == "denied"

        # Delete first checklist with admin token
        resp_delete = delete_checklist(admin_token, checklist_id)
        assert resp_delete.status_code == 204

        # Delete second checklist (deny test)
        resp_delete2 = delete_checklist(admin_token, checklist2_id)
        assert resp_delete2.status_code == 204

        # Export checklist PDF - recreate checklist for PDF export test
        resp_create3 = create_checklist(operator_token, line_id)
        assert resp_create3.status_code == 201
        checklist3 = resp_create3.json()
        checklist3_id = checklist3.get("id") or checklist3.get("_id")
        assert checklist3_id

        # Try export PDF with operator token - expect 403 Forbidden
        resp_pdf_op = export_checklist_pdf(operator_token, checklist3_id)
        assert resp_pdf_op.status_code == 403

        # Export PDF with admin token - expect 200 and content-type application/pdf
        resp_pdf_admin = export_checklist_pdf(admin_token, checklist3_id)
        assert resp_pdf_admin.status_code == 200
        content_type = resp_pdf_admin.headers.get("Content-Type", "")
        assert "application/pdf" in content_type

    finally:
        # Cleanup any created checklists to keep environment clean
        # Attempt deletion with admin token if checklist_id is not None
        if 'checklist_id' in locals() and checklist_id:
            delete_checklist(admin_token, checklist_id)
        if 'checklist2_id' in locals() and checklist2_id:
            delete_checklist(admin_token, checklist2_id)
        if 'checklist3_id' in locals() and checklist3_id:
            delete_checklist(admin_token, checklist3_id)

test_post_api_checklists_create_and_manage_checklist_lifecycle()