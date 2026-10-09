import type { ReactNode } from "react";
import { Link } from "react-router";

/**
 * Plain-language policy drafts describing the product's actual behavior.
 * They require operator and legal review before a public launch; the support
 * contact comes from configuration.
 */
export interface Policy {
  title: string;
  description: string;
  body: (contact: string | null) => ReactNode;
}
const Contact = ({ contact }: { contact: string | null }) =>
  contact ? (
    <a href={contact.includes("@") ? `mailto:${contact}` : contact}>
      {contact}
    </a>
  ) : (
    <span>the support contact published on this page before launch</span>
  );

export const POLICIES: Record<string, Policy> = {
  privacy: {
    title: "Privacy",
    description:
      "What VeganAlts collects, why, how long it is kept and how to reach us.",
    body: (contact) => (
      <>
        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>Account:</strong> when you sign in with Google or Apple we
            receive your name, email address and provider identifier. Your
            public profile shows only the handle and display name you choose.
          </li>
          <li>
            <strong>Contributions:</strong> ratings, comments and votes,
            reports, proposed changes, category proposals and the photos and
            sources you submit. Your individual ratings stay private; profiles
            show only counts.
          </li>
          <li>
            <strong>Security signals:</strong> your IP address and Cloudflare
            Turnstile results are used briefly to limit abuse. They are not used
            for advertising.
          </li>
          <li>
            <strong>Measurement:</strong> privacy-oriented Cloudflare Web
            Analytics and aggregate product events (for example, a page view or
            a saved rating) without names or email addresses.
          </li>
        </ul>
        <h2>Automated moderation</h2>
        <p>
          To keep the catalog accurate and free of spam, the text and photos you
          contribute are evaluated by Cloudflare Workers AI decision models
          (Clef). We keep only the structured answers, probabilities and usage
          figures, not the prompts or any generated prose. Automated results are
          advisory: they can hold something for a person to review, but they
          never decide that a product is vegan.
        </p>
        <h2>How long we keep it</h2>
        <ul>
          <li>
            Uploaded photos waiting for publication are deleted after a day if
            unfinished, or after 30 days if a review does not accept them.
          </li>
          <li>
            Accepted catalog facts, photos and their history are kept so changes
            can be audited and reversed.
          </li>
          <li>
            Ratings and comments stay until you delete them or ask us to close
            your account.
          </li>
        </ul>
        <h2>Cookies</h2>
        <p>
          We use a sign-in session cookie and short-lived security cookies. We
          do not use advertising or cross-site tracking cookies.
        </p>
        <h2>Where it is stored</h2>
        <p>
          VeganAlts runs on Cloudflare (Workers, D1, R2, Images, Workers AI and
          Turnstile). Sign-in uses Google and Apple.
        </p>
        <h2>Your choices</h2>
        <p>
          You can edit or delete your comments and change your ratings at any
          time. To access, export or delete your account data, contact{" "}
          <Contact contact={contact} />.
        </p>
      </>
    ),
  },
  terms: {
    title: "Terms and community guidelines",
    description: "The rules for using and contributing to VeganAlts.",
    body: (contact) => (
      <>
        <h2>Using VeganAlts</h2>
        <p>
          VeganAlts is a community guide. Scores reflect how similar people
          found an alternative to a conventional food; they are opinions, not
          nutrition, health or allergy advice. Always check the package before
          buying or eating, especially for allergens.
        </p>
        <h2>Contributing</h2>
        <ul>
          <li>Rate and comment only on products you have tried.</li>
          <li>
            Share useful experience: taste, texture, cooking and how it
            compares. Short opinions are welcome.
          </li>
          <li>
            Do not post spam, promotions, personal attacks, hateful or explicit
            content, or other people’s private information.
          </li>
          <li>
            Only upload photos you took or have the right to share. You allow
            VeganAlts to display your contributions on the service.
          </li>
          <li>
            Propose factual changes with evidence. Do not confirm a change you
            have not checked yourself.
          </li>
        </ul>
        <h2>Ranking integrity</h2>
        <p>
          Nobody can pay for a better position. Brands, sponsors and moderators
          get the same single rating as everyone else. We may exclude
          manipulated activity.
        </p>
        <h2>Enforcement</h2>
        <p>
          We may hide content, limit accounts or reverse changes that break
          these guidelines. See{" "}
          <Link to="/about/moderation">how moderation works</Link>. To appeal,
          contact <Contact contact={contact} />.
        </p>
      </>
    ),
  },
  moderation: {
    title: "How moderation and reporting work",
    description:
      "Opinions publish quickly; facts need evidence; protected facts need a person.",
    body: () => (
      <>
        <p>
          VeganAlts follows a simple rule: opinions publish quickly, facts
          accumulate confidence, and high-risk facts get stronger protection.
        </p>
        <h2>Comments</h2>
        <p>
          Comments normally appear right away. Votes measure whether a comment
          is useful, not whether you agree. Heavily downvoted comments are
          collapsed behind a Show button, not deleted. Likely spam or promotions
          may wait for a moderator.
        </p>
        <h2>Suggested changes</h2>
        <ul>
          <li>
            <strong>Low-risk additions</strong> such as another name for a
            product can apply after an automated check.
          </li>
          <li>
            <strong>Community-confirmable changes</strong> such as a new package
            name or photo apply after independent confirmation and no
            disagreement.
          </li>
          <li>
            <strong>Protected changes</strong> such as vegan status, formula
            changes, ingredient photos, merges and category changes always need
            a moderator.
          </li>
        </ul>
        <h2>Automated checks</h2>
        <p>
          Automated checks (Cloudflare Workers AI Clef) look for obvious
          problems: a photo that shows a different product, spam, or unrelated
          content. They can hold something for review or ask you to fix it. If
          the check is unavailable, a person reviews instead; it never approves
          something on its own.
        </p>
        <h2>Reports</h2>
        <p>
          Use Report on a product, photo or comment. Reports never change the
          catalog by themselves; a moderator assesses them. Ingredient concerns
          get priority. Every decision is recorded and can be reversed.
        </p>
      </>
    ),
  },
  rankings: {
    title: "How rankings work",
    description:
      "Top, Trending and New, and why a few ratings cannot dominate.",
    body: () => (
      <>
        <h2>Top</h2>
        <p>
          Each category asks one question: how close does this alternative come
          to the conventional food? Rankings are based on community similarity
          ratings and account for how many people rated a product, so a product
          with only a few ratings cannot unfairly outrank an established one.
          Products marked Early have fewer than ten ratings.
        </p>
        <p>
          A product can appear in several categories with independent scores.
          When a recipe changes materially, the new formula starts fresh and
          earlier ratings stay with the formula people tried.
        </p>
        <h2>Trending</h2>
        <p>
          Trending highlights unusual recent activity — new ratings, tries and
          discussion — compared with the week before, and fades as activity
          slows. It never changes Top.
        </p>
        <h2>New</h2>
        <p>
          New lists recently added products, newest first, so they can be found
          before they have enough ratings to rank. Being new never raises a Top
          score.
        </p>
        <h2>What never affects rankings</h2>
        <p>
          Payment, sponsorship, brand relationships, moderator status and
          comment votes. Manipulated activity may be excluded.
        </p>
      </>
    ),
  },
  "vegan-status": {
    title: "Vegan status explained",
    description:
      "How VeganAlts classifies products and why it is not a certification.",
    body: () => (
      <>
        <p>
          VeganAlts classifies each formula from the ingredient evidence
          available. It records manufacturer wording and third-party
          certifications separately.
        </p>
        <ul>
          <li>
            <strong>Vegan:</strong> a moderator reviewed evidence showing no
            animal-derived ingredients.
          </li>
          <li>
            <strong>Appears vegan:</strong> no known animal-derived ingredients,
            but the evidence is incomplete or not yet reviewed.
          </li>
          <li>
            <strong>Plant-based:</strong> labeled plant-based where VeganAlts
            cannot establish the stronger status.
          </li>
          <li>
            <strong>Under review:</strong> a credible ingredient concern is
            being assessed. The product leaves active rankings until it is
            resolved.
          </li>
        </ul>
        <p>
          This is not a certification and not allergy advice. Formulas change;
          always check the current package. Automated checks never decide that a
          product is vegan.
        </p>
      </>
    ),
  },
  contact: {
    title: "Contact and support",
    description: "How to reach VeganAlts.",
    body: (contact) => (
      <>
        <p>
          For account questions, data requests, appeals or anything else,
          contact <Contact contact={contact} />.
        </p>
        <p>
          To flag a product, photo or comment, use its Report action so a
          moderator sees the details.
        </p>
      </>
    ),
  },
};
