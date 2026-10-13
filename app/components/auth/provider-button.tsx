import googleLogo from "../../assets/auth/google-g.png";
import appleBlack from "../../assets/auth/apple-continue-black.png";
import appleWhite from "../../assets/auth/apple-continue-white.png";

/** Provider artwork stays local; authentication remains the native form POST. */
export function ProviderButton({
  provider,
  disabled,
}: {
  provider: "google" | "apple";
  disabled: boolean;
}) {
  return (
    <button
      type="submit"
      className={`va-provider va-provider--${provider}`}
      name="provider"
      value={provider}
      disabled={disabled}
    >
      {provider === "google" ? (
        <>
          <img
            className="va-provider__google-icon"
            src={googleLogo}
            width={20}
            height={20}
            alt=""
          />
          <span>Continue with Google</span>
        </>
      ) : (
        <>
          <img
            className="va-provider__apple-light"
            src={appleBlack}
            width={240}
            height={48}
            alt=""
          />
          <img
            className="va-provider__apple-dark"
            src={appleWhite}
            width={240}
            height={48}
            alt=""
          />
          <span className="sr-only">Continue with Apple</span>
        </>
      )}
    </button>
  );
}
