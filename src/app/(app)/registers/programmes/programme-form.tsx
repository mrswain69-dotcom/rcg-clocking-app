import { registerAction } from "../actions";
export type Programme = {
  id: string;
  name: string;
  external_label: string;
  kind: string;
  first_date: string;
  last_date: string;
  start_time: string;
  end_time: string;
  interval_weeks: number;
  excluded_dates: string[];
  revision: number;
  active: boolean;
};
export function ProgrammeForm({ programme }: { programme?: Programme }) {
  return (
    <form action={registerAction} className="mt-4 grid gap-4 sm:grid-cols-2">
      <input
        type="hidden"
        name="action"
        value={programme ? "update_programme" : "create_programme"}
      />
      {programme ? (
        <>
          <input type="hidden" name="programme_id" value={programme.id} />
          <input type="hidden" name="revision" value={programme.revision} />
        </>
      ) : null}
      <label>
        Programme name
        <input
          className="input"
          name="name"
          required
          minLength={2}
          maxLength={200}
          defaultValue={programme?.name}
        />
      </label>
      <label>
        Neutral name used in emails
        <input
          className="input"
          name="external_label"
          required
          minLength={2}
          maxLength={200}
          defaultValue={programme?.external_label ?? "RCG session"}
        />
      </label>
      {!programme ? (
        <label>
          Type
          <select className="input" name="kind">
            <option value="group">Group</option>
            <option value="individual">Individual</option>
          </select>
        </label>
      ) : null}
      <label>
        First session date
        <input
          className="input"
          type="date"
          name="first_date"
          required
          defaultValue={programme?.first_date}
        />
      </label>
      <label>
        Last session date
        <input
          className="input"
          type="date"
          name="last_date"
          required
          defaultValue={programme?.last_date}
        />
      </label>
      <label>
        Start · UK time
        <input
          className="input"
          type="time"
          name="start_time"
          required
          defaultValue={programme?.start_time.slice(0, 5)}
        />
      </label>
      <label>
        End · UK time
        <input
          className="input"
          type="time"
          name="end_time"
          required
          defaultValue={programme?.end_time.slice(0, 5)}
        />
      </label>
      <label>
        Repeat
        <select
          className="input"
          name="interval_weeks"
          defaultValue={programme?.interval_weeks ?? 1}
        >
          <option value="1">Weekly</option>
          <option value="2">Fortnightly</option>
        </select>
      </label>
      <label className="sm:col-span-2">
        Breaks and excluded dates
        <textarea
          className="input"
          name="excluded_dates"
          placeholder="2026-12-22, 2026-12-29"
          defaultValue={programme?.excluded_dates.join(", ")}
        />
        <small>
          Use YYYY-MM-DD, separated by commas. The first date sets the weekday.
          Maximum schedule: two years.
        </small>
      </label>
      {programme ? (
        <label>
          <input
            type="checkbox"
            name="active"
            defaultChecked={programme.active}
          />{" "}
          Active programme
        </label>
      ) : null}
      <p className="sm:col-span-2">
        Saving the schedule does not change existing registers. Review the dates
        and create missing registers on the next screen.
      </p>
      <button className="btn btn-primary" type="submit">
        {programme ? "Save programme settings" : "Create programme"}
      </button>
    </form>
  );
}
