import React, { useEffect } from "react";

/**
 * Global page UX helper.
 *
 * This component intentionally renders nothing. It applies lightweight
 * application-wide behaviour and can safely be mounted from Layout.jsx.
 */
export default function PageUXEnhancer() {
  useEffect(() => {
    const onKeyDown = (event) => {
      // Prevent accidental browser submission/refresh behaviour when Enter
      // is pressed inside multi-line fields.
      if (
        event.key === "Enter" &&
        event.target &&
        event.target.tagName === "TEXTAREA"
      ) {
        event.stopPropagation();
      }
    };

    const onClick = (event) => {
      const target = event.target?.closest?.("[data-scroll-top]");
      if (target) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("click", onClick);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("click", onClick);
    };
  }, []);

  return null;
}
