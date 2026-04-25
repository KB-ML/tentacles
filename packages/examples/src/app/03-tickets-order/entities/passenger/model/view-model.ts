import { createFormContract, createFormViewModel } from "@kbml-tentacles/forms";
import { passengerFormContract } from "./passenger-form";

export const ticketsFormContract = createFormContract().array("passengers", passengerFormContract);

export const ticketsViewModel = createFormViewModel({
  contract: ticketsFormContract,
  validate: { mode: "all", reValidate: "change" },
});
