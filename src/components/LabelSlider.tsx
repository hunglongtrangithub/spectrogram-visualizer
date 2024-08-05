import { useCallback, useRef, useEffect } from "react";
import Slider from "@mui/material/Slider";
import Typography from "@mui/material/Typography";

import { SliderLabelContainer } from "./StyledComponents";

export interface LabelledSliderProps {
  nameLabelId: string;
  nameLabel: string;
  min: number;
  max: number;
  step?: number;
  defaultValue: number;
  onChange: (value: number) => void;
}

export type LabelledSlider = (props: LabelledSliderProps) => JSX.Element;

const castSliderValue = (value: number | number[]) => {
  if (typeof value === "number") {
    return value;
  }
  return value[0];
};

// This is an ugly hack to be able to update the value label very quickly. Having a prop for the
// label and updating it as the slider is dragged causes severe stuttering of the spectrogram due to
// React taking CPU time re-rendering components.
function generateLabelledSlider(): [LabelledSlider, (value: string) => void] {
  let lastValueLabel: string = "";
  let span: HTMLSpanElement | null = null;
  const onSpanChange = (newSpan: HTMLSpanElement | null) => {
    if (newSpan !== null && newSpan !== span) {
      // Empty the node
      while (newSpan.firstChild) {
        newSpan.removeChild(newSpan.firstChild);
      }
      // Add a new single text node
      newSpan.appendChild(document.createTextNode(""));
    }
    span = newSpan;

    // Update the contents
    if (span !== null && span.firstChild !== null) {
      span.firstChild.nodeValue = lastValueLabel;
    }
  };

  const LabelledSlider = ({
    nameLabelId,
    nameLabel,
    min,
    max,
    step = 1,
    defaultValue,
    onChange,
  }: LabelledSliderProps) => {
    const valueLabelRef = useRef<HTMLSpanElement | null>(null);
    useEffect(() => {
      onSpanChange(valueLabelRef.current);
    });

    const changeCallback = useCallback(
      (event: Event, value: number | number[], activeThumb: number) => {
        onChange(castSliderValue(value));
      },
      [onChange],
    );

    return (
      <>
        <SliderLabelContainer>
          <Typography id={nameLabelId} color="textSecondary" variant="caption">
            {nameLabel}
          </Typography>
          <Typography
            color="textPrimary"
            variant="caption"
            ref={valueLabelRef}
          />
        </SliderLabelContainer>
        <Slider
          aria-labelledby={nameLabelId}
          size="small"
          step={step}
          min={min}
          max={max}
          defaultValue={defaultValue}
          onChange={changeCallback}
        />
      </>
    );
  };

  return [
    LabelledSlider,
    (value: string) => {
      lastValueLabel = value;
      onSpanChange(span);
    },
  ];
}

export default generateLabelledSlider;
