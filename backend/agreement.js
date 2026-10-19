// The authorization every customer signs during registration.
// IMPORTANT: if you change the wording, bump AGREEMENT_VERSION.
// Each signature stores the version and a fingerprint of the exact text signed.
// Have an Illinois attorney review this text before launch.

export const COMPANY_LEGAL_NAME = process.env.COMPANY_LEGAL_NAME || 'Liyfe Transpo LLC';

export const AGREEMENT_VERSION = '1.0';

export const AGREEMENT_TEXT = `AUTHORIZATION FOR PRESCRIPTION PICKUP AND DELIVERY

I authorize ${COMPANY_LEGAL_NAME} ("Liyfe Transpo"), including its employees and drivers, to act as my authorized agent to pick up prescriptions and pharmacy items that have been filled for me at the pharmacies I choose, and to deliver them to the address I provide.

I understand and agree that:

1. Liyfe Transpo works for me. It is not hired by, and does not work for, any pharmacy. Liyfe Transpo is not a pharmacy. It does not fill, dispense, or give advice about medication.

2. To pick up for me, Liyfe Transpo may give my pharmacy my name, date of birth, phone number, address, and prescription or order numbers, and may show the pharmacy a copy of this signed authorization.

3. Each pharmacy decides whether to release my prescription to Liyfe Transpo. I am responsible for telling my pharmacy that Liyfe Transpo is my authorized pickup and for completing any form my pharmacy requires.

4. I am responsible for any copay or balance owed to the pharmacy. Liyfe Transpo does not pay copays for me unless we agree to that in writing.

5. Questions about my medication should go to my pharmacist or doctor. Liyfe Transpo may share my pharmacist's questions or instructions with me but does not give medical advice.

6. Liyfe Transpo may refuse or limit pickups of certain medications, including controlled substances, and may require my signature or photo ID when the delivery is handed over.

7. Liyfe Transpo will keep my information private and use it only to provide this service, as described in its Privacy Policy.

8. This authorization stays in effect until I revoke it. I can revoke it at any time from my account or by contacting Liyfe Transpo. Revoking it does not undo pickups already completed.

By typing my full legal name and checking the box, I am signing this authorization electronically. I agree my electronic signature has the same effect as my handwritten signature.`;
