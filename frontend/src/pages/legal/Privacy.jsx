import React from 'react'
import LegalPage, { LegalContact, LegalList, LegalSection } from '../../components/LegalPage'
import { LEGAL_DETAILS } from '../../config/legal'

const SECTIONS = [
  { id: 'scope', title: 'Scope and controller' },
  { id: 'information', title: 'Information we collect' },
  { id: 'use', title: 'How we use information' },
  { id: 'basis', title: 'Legal bases' },
  { id: 'sharing', title: 'How we share information' },
  { id: 'international', title: 'International transfers' },
  { id: 'retention', title: 'Retention and security' },
  { id: 'rights', title: 'Your privacy rights' },
  { id: 'children', title: 'Children' },
  { id: 'changes', title: 'Changes to this policy' },
  { id: 'contact', title: 'Contact us' },
]

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      description="This policy explains what personal information SeryeKo.com collects, why we use it, and the choices available to you."
      sections={SECTIONS}
    >
      <LegalSection id="scope" title="1. Scope and controller">
        <p>
          This policy applies when you use {LEGAL_DETAILS.serviceName}, including our website, streaming
          features, account tools, payments, referrals, and support channels. The service is operated from
          the Philippines by {LEGAL_DETAILS.operatorName}, which acts as the personal information controller.
        </p>
        <p>
          We process personal information under the Philippine Data Privacy Act of 2012 and its implementing
          rules. Additional local rights may apply depending on where you live.
        </p>
      </LegalSection>

      <LegalSection id="information" title="2. Information we collect">
        <LegalList>
          <li><strong className="text-ink">Account data:</strong> name, email address, password hash, account settings, and authentication details.</li>
          <li><strong className="text-ink">Subscription data:</strong> plan, purchase status, transaction references, refund requests, and referral or voucher activity. Payment providers process your payment credentials; we do not need to store full card numbers.</li>
          <li><strong className="text-ink">Viewing data:</strong> watch history, progress, watchlist, content searches, language, subtitle, and playback preferences.</li>
          <li><strong className="text-ink">Device and usage data:</strong> browser or device type, IP address, approximate location derived from IP, access times, diagnostic logs, and interactions with the service.</li>
          <li><strong className="text-ink">Communications:</strong> support requests, reports, refund reasons, and other messages you send us.</li>
        </LegalList>
        <p>We receive information directly from you, automatically from your use, and from service providers such as identity and payment partners.</p>
      </LegalSection>

      <LegalSection id="use" title="3. How we use information">
        <LegalList>
          <li>Provide accounts, streaming, watch progress, subscriptions, referrals, and customer support.</li>
          <li>Process purchases, verify payment status, prevent duplicate refunds, and administer the 7-day guarantee.</li>
          <li>Personalize recommendations and remember settings across devices.</li>
          <li>Secure the service, detect fraud or abuse, enforce our Terms, and troubleshoot failures.</li>
          <li>Analyze and improve performance, content discovery, and product features.</li>
          <li>Send service messages and, where permitted, marketing that you can opt out of.</li>
          <li>Comply with legal obligations and respond to lawful requests.</li>
        </LegalList>
      </LegalSection>

      <LegalSection id="basis" title="4. Legal bases">
        <p>
          Depending on the activity and applicable law, we rely on performance of our contract with you,
          compliance with law, our legitimate interests in operating and securing the service, and your
          consent. You may withdraw consent at any time, without affecting earlier lawful processing.
        </p>
      </LegalSection>

      <LegalSection id="sharing" title="5. How we share information">
        <p>We do not sell your personal information. We may disclose only what is reasonably necessary to:</p>
        <LegalList>
          <li>Cloud hosting, analytics, communications, authentication, content delivery, and technical service providers.</li>
          <li>PayMongo and other payment partners that process transactions and refunds under their own privacy terms.</li>
          <li>Professional advisers, regulators, courts, law enforcement, or other parties when required by law or needed to protect rights and safety.</li>
          <li>A buyer or successor in a merger, financing, reorganization, or sale, subject to appropriate safeguards.</li>
        </LegalList>
        <p>We require processors acting for us to protect personal information and use it only for authorized services.</p>
      </LegalSection>

      <LegalSection id="international" title="6. International transfers">
        <p>
          Our providers and users may be located outside the Philippines. When personal information crosses
          borders, we use contractual, organizational, or other lawful safeguards appropriate to the transfer.
        </p>
      </LegalSection>

      <LegalSection id="retention" title="7. Retention and security">
        <p>
          We retain information while your account is active and as needed for the purposes above, then delete
          or de-identify it unless law, fraud prevention, dispute resolution, accounting, or enforcement requires
          longer retention. Retention periods vary by data type.
        </p>
        <p>
          We use reasonable technical and organizational safeguards, but no internet service is completely
          secure. Keep your password confidential and contact us if you suspect unauthorized access.
        </p>
      </LegalSection>

      <LegalSection id="rights" title="8. Your privacy rights">
        <p>
          Subject to applicable law, you may request access, correction, deletion or blocking, data portability,
          or a copy of your information; object to or restrict processing; withdraw consent; and complain to the
          Philippine National Privacy Commission or your local authority.
        </p>
        <p>
          Email us to make a request. We may verify your identity and may retain information where a lawful
          exception applies. Authorized agents must show proof of authority.
        </p>
      </LegalSection>

      <LegalSection id="children" title="9. Children">
        <p>
          The service is not directed to children under 13. If local law requires a higher age for valid consent,
          a parent or guardian must authorize use. Contact us if you believe a child provided information without
          the required permission.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="10. Changes to this policy">
        <p>
          We may update this policy as the service or law changes. We will post the revised version with a new
          “Last updated” date and provide additional notice when required.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="11. Contact us">
        <p>Contact the operator or privacy team with requests or questions:</p>
        <LegalContact subject="Privacy request" />
      </LegalSection>
    </LegalPage>
  )
}
