import React from 'react'
import { Link } from 'react-router-dom'
import LegalPage, { LegalContact, LegalList, LegalSection } from '../../components/LegalPage'

const SECTIONS = [
  { id: 'guarantee', title: '7-day guarantee' },
  { id: 'eligibility', title: 'Eligibility' },
  { id: 'request', title: 'How to request a refund' },
  { id: 'processing', title: 'Review and payment timing' },
  { id: 'effects', title: 'Effect of a refund' },
  { id: 'exceptions', title: 'Exceptions and statutory rights' },
  { id: 'contact', title: 'Contact' },
]

export default function RefundPolicy() {
  return (
    <LegalPage
      title="Refund Policy"
      description="Lifetime Access purchases include a 7-day money-back guarantee. This policy explains the eligibility window and request process."
      sections={SECTIONS}
    >
      <LegalSection id="guarantee" title="1. 7-day guarantee">
        <p>
          You may request a full refund of an eligible SeryeKo Lifetime Access purchase within seven calendar days
          after the purchase is successfully activated. The window ends at the same time of day seven days after
          activation.
        </p>
        <p>
          You do not need to prove that the service was defective. We may ask for a reason to improve the product,
          prevent fraud, or resolve technical issues, but your selected reason does not reduce an otherwise valid
          guarantee claim.
        </p>
      </LegalSection>

      <LegalSection id="eligibility" title="2. Eligibility">
        <p>A request is eligible under this guarantee when:</p>
        <LegalList>
          <li>It concerns an active Lifetime Access purchase made through SeryeKo.</li>
          <li>It is submitted no later than seven calendar days after activation.</li>
          <li>The purchase has not already been refunded, reversed, or charged back.</li>
          <li>The request is made by the account holder or verified purchaser.</li>
        </LegalList>
        <p>
          The guarantee applies once per purchase. Referral discounts and vouchers do not remove eligibility; the
          refund amount will not exceed the amount actually paid.
        </p>
      </LegalSection>

      <LegalSection id="request" title="3. How to request a refund">
        <p>
          Sign in and open <Link to="/refund" className="text-accent hover:underline">Request Refund</Link> from
          Profile → Settings or Help & Support. Select a reason and submit the form before the eligibility window
          closes. If you cannot access your account, email support from the purchase email address with the account
          email and transaction reference.
        </p>
        <p>Submitting a request does not immediately reverse the payment or cancel access.</p>
      </LegalSection>

      <LegalSection id="processing" title="4. Review and payment timing">
        <p>
          We normally review requests within 1–2 business days. Approved refunds are sent to the original payment
          method through PayMongo or the relevant payment provider. Banks and wallet providers control when the
          credit appears; processing commonly takes several additional business days.
        </p>
        <p>
          We may ask for limited information needed to locate the transaction, verify account ownership, or
          investigate duplicate, abusive, or fraudulent requests.
        </p>
      </LegalSection>

      <LegalSection id="effects" title="5. Effect of a refund">
        <p>
          Once a refund is approved or completed, Lifetime Access is cancelled and paid viewing access may end
          immediately. Related referral commissions, rewards, or credits may also be cancelled. Your account may
          remain available at the free access level unless it is separately closed.
        </p>
      </LegalSection>

      <LegalSection id="exceptions" title="6. Exceptions and statutory rights">
        <p>
          Requests outside the 7-day guarantee may be denied unless required by law or separately approved. We may
          deny or investigate requests involving fraud, abuse, duplicate refunds, chargebacks, or purchases not
          processed for SeryeKo.
        </p>
        <p>
          Nothing in this policy limits non-waivable remedies under the Philippine Consumer Act or other consumer
          law that applies to you. If the service is defective or not supplied as promised, you may have rights in
          addition to this voluntary guarantee.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="7. Contact">
        <p>For refund questions or account-access help:</p>
        <LegalContact subject="Refund request help" />
      </LegalSection>
    </LegalPage>
  )
}
