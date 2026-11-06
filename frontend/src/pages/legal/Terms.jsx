import React from 'react'
import { Link } from 'react-router-dom'
import LegalPage, { LegalContact, LegalList, LegalSection } from '../../components/LegalPage'
import { LEGAL_DETAILS } from '../../config/legal'

const SECTIONS = [
  { id: 'agreement', title: 'Agreement and eligibility' },
  { id: 'accounts', title: 'Accounts' },
  { id: 'service', title: 'Service and license' },
  { id: 'payments', title: 'Purchases and refunds' },
  { id: 'conduct', title: 'Acceptable use' },
  { id: 'content', title: 'Content and intellectual property' },
  { id: 'third-party', title: 'Third-party services' },
  { id: 'termination', title: 'Suspension and termination' },
  { id: 'disclaimers', title: 'Disclaimers and liability' },
  { id: 'indemnity', title: 'Indemnity' },
  { id: 'law', title: 'Governing law and disputes' },
  { id: 'general', title: 'General terms' },
  { id: 'contact', title: 'Contact' },
]

export default function Terms() {
  return (
    <LegalPage
      title="Terms of Use"
      description="These terms govern your access to SeryeKo.com. Please read them before creating an account or purchasing Lifetime Access."
      sections={SECTIONS}
    >
      <LegalSection id="agreement" title="1. Agreement and eligibility">
        <p>
          These Terms form a contract between you and {LEGAL_DETAILS.operatorName}. By accessing or using
          {` ${LEGAL_DETAILS.serviceName}`}, you accept these Terms and our <Link to="/privacy" className="text-accent hover:underline">Privacy Policy</Link>.
          If you do not agree, do not use the service.
        </p>
        <p>
          You must be at least 13 and legally able to enter this agreement. If you are under the age of majority
          where you live, a parent or guardian must review and accept these Terms for you.
        </p>
      </LegalSection>

      <LegalSection id="accounts" title="2. Accounts">
        <LegalList>
          <li>Provide accurate information and keep it current.</li>
          <li>Protect your password and promptly report unauthorized access.</li>
          <li>You are responsible for activity under your account unless caused by our failure to use reasonable care.</li>
          <li>One account is for one household or individual and may stream on no more than three devices simultaneously.</li>
          <li>You may not sell, transfer, share commercially, or create accounts through automated means.</li>
        </LegalList>
      </LegalSection>

      <LegalSection id="service" title="3. Service and license">
        <p>
          We grant you a limited, personal, non-exclusive, non-transferable, revocable license to access the
          service and stream available content for private, non-commercial viewing in supported locations.
        </p>
        <p>
          “Lifetime Access” means access for the operational lifetime of the SeryeKo service, not your natural
          lifetime or guaranteed perpetual availability of any title, provider, feature, or device. Catalog,
          quality, subtitles, availability, and functionality may change due to licenses, providers, law, security,
          or technical needs.
        </p>
      </LegalSection>

      <LegalSection id="payments" title="4. Purchases and refunds">
        <p>
          Prices and applicable taxes are shown before purchase. Lifetime Access is a one-time purchase with no
          recurring subscription fee unless you separately agree to a future paid offering.
        </p>
        <p>
          Eligible Lifetime Access purchases may be refunded when requested within seven calendar days after
          activation. The complete process and limitations are in our <Link to="/refund-policy" className="text-accent hover:underline">Refund Policy</Link>,
          which is incorporated into these Terms. Your mandatory consumer rights remain unaffected.
        </p>
      </LegalSection>

      <LegalSection id="conduct" title="5. Acceptable use">
        <p>You must not:</p>
        <LegalList>
          <li>Copy, download, rebroadcast, publicly perform, sell, sublicense, or commercially exploit content except where law expressly permits.</li>
          <li>Circumvent access controls, payment limits, geographic restrictions, encryption, or digital rights management.</li>
          <li>Scrape, crawl, automate access, overload systems, introduce malware, probe security, or reverse engineer the service.</li>
          <li>Use the service unlawfully, impersonate another person, infringe rights, or harass users or staff.</li>
          <li>Manipulate referrals, vouchers, refunds, playback counts, or other program rules.</li>
        </LegalList>
      </LegalSection>

      <LegalSection id="content" title="6. Content and intellectual property">
        <p>
          The service software, branding, design, and related materials belong to us or our licensors. Audiovisual
          titles and related artwork belong to their respective rights holders. No ownership transfers to you.
        </p>
        <p>
          If you believe material infringes copyright, use our <Link to="/dmca" className="text-accent hover:underline">DMCA and Copyright Policy</Link>.
          We may remove or restrict content while reviewing a notice.
        </p>
      </LegalSection>

      <LegalSection id="third-party" title="7. Third-party services">
        <p>
          The service may depend on payment processors, identity providers, hosting providers, content sources,
          and links we do not control. Their terms and privacy practices may apply. We are not responsible for
          third-party services to the extent allowed by law.
        </p>
      </LegalSection>

      <LegalSection id="termination" title="8. Suspension and termination">
        <p>
          You may stop using the service at any time. We may suspend or terminate access for material or repeated
          violations, fraud, security risk, legal requirements, or discontinuation of the service. Where reasonable,
          we will provide notice and an opportunity to appeal.
        </p>
        <p>
          If we permanently discontinue the entire paid service, any remedy will be determined under applicable
          law and the commitments shown at purchase. Sections that by nature should survive will remain effective.
        </p>
      </LegalSection>

      <LegalSection id="disclaimers" title="9. Disclaimers and liability">
        <p>
          To the maximum extent permitted by law, the service is provided “as is” and “as available.” We do not
          guarantee uninterrupted access, error-free playback, continued availability of particular content, or
          compatibility with every device.
        </p>
        <p>
          To the maximum extent permitted by law, we will not be liable for indirect, incidental, special,
          consequential, or punitive damages, or lost profits or data. Our aggregate liability arising from the
          service will not exceed the amount you paid us in the 12 months before the event giving rise to the claim.
          These limits do not exclude liability that cannot lawfully be limited, including statutory consumer rights.
        </p>
      </LegalSection>

      <LegalSection id="indemnity" title="10. Indemnity">
        <p>
          To the extent permitted by law, you agree to indemnify the operator against third-party claims and
          reasonable costs arising from your unlawful use, your content, or your material breach of these Terms.
          This does not apply to losses caused by our own acts or omissions.
        </p>
      </LegalSection>

      <LegalSection id="law" title="11. Governing law and disputes">
        <p>
          Philippine law governs these Terms, without overriding mandatory protections in your country of residence.
          Before filing a claim, contact us and allow 30 days for an informal resolution. Courts located in
          {` ${LEGAL_DETAILS.governingVenue}`} will have non-exclusive jurisdiction where legally permitted.
        </p>
      </LegalSection>

      <LegalSection id="general" title="12. General terms">
        <p>
          We may update these Terms for legal, security, or service changes. Material updates will receive
          reasonable notice where required. If one provision is unenforceable, the rest remain effective. Our
          failure to enforce a provision is not a waiver. You may not assign this agreement without our consent;
          we may assign it as part of a reorganization or transfer of the service.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="13. Contact">
        <LegalContact subject="Terms of Use question" />
      </LegalSection>
    </LegalPage>
  )
}
