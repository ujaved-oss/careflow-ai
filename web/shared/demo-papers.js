// Fictional labeled documents. Deliberately no live patient or payer information.
export function samplePaper(kind,{patient_name='Amelia Brooks',external_reference='SYN-MIRA-AI',procedure='MRI brain'}={}){
 const identity=`Patient: ${patient_name}\nReferral reference: ${external_reference}`;
 const templates={
  referral:`Document type: Referral\n${identity}\nRequested test: ${procedure}\nReferring practice: Lakeview Sample Practice\nSigned: yes\nRequest: Fictional outpatient ${procedure} order. Please review before booking.`,
  clinical:`Document type: Clinical note\n${identity}\nSupporting note: Fictional supporting note for the requested ${procedure}. A clinician must review the original order.`,
  policy:`Document type: Payer policy\nPayer: Northlake Fictional Health\nPlan: Sample outpatient plan\nProcedure: ${procedure}\nEffective from: 2026-01-01\nEffective until: 2027-12-31\nRequires: Signed order\nRequires: Supporting note\nThis is a made-up policy for the demonstration.`,
  insurance:`Document type: Authorization reply\n${identity}\nDecision: Approved\nAuthorization reference: AUTH-SAMPLE-1041\nReason: Fictional authorization recorded for the requested ${procedure}.\nValid until: 2027-12-31\nNo real insurer issued this letter.`,
  billing:`Document type: Claim denial\n${identity}\nDecision: Denied\nReference: DEN-SAMPLE-1041\nReason: Sample supporting attachment was missing from the submitted claim.\nNo real claim or payment exists.`,
  report:`Document type: Radiology report\n${identity}\nReport: Fictional demonstration report. This text is not a medical finding.`,
 };
 return {name:({referral:'Sample signed referral',clinical:'Sample supporting note',policy:'Sample plan rules',insurance:'Sample insurer reply',billing:'Sample claim denial',report:'Sample report'})[kind]||'Sample paper',kind,text:templates[kind]||'',fictional:true};
}
