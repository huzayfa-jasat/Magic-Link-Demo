// Style Imports
import "../styles/loading_circle.css";

export function LoadingCircle({
  showBg = true,
  relative = false,
}) {
  return (
    <div
		className={"loading-circle-cont" + (!showBg ? " tp" : "") + (relative ? " rl" : "")}
	>
      <div>
        <div />
      </div>
    </div>
  );
}