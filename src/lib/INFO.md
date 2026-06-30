This code implements a **Behavioral Biometrics Engine**. Instead of checking *what* you know (like a password), it checks *how* you behave (typing rhythm, mouse speed, touch pressure).

The architecture is a client-side **machine learning pipeline** consisting of three distinct layers: **Data Collection**, **Feature Extraction**, and **Probabilistic Inference (The Brain)**.

Here is the breakdown of how the engine works and its architecture.

---

### 1. High-Level Architecture

The system follows a standard ML pipeline architecture:

1.  **Sensors (Input Layer):** Listens for raw DOM events (`keydown`, `mousemove`, `touchstart`).
2.  **Collector (Data Layer):** The `BehavioralCollector` class buffers these events and calculates raw physical metrics (time differences, distances).
3.  **Feature Extractor (Transformation Layer):** Converts raw arrays of events into statistical summaries (Features).
4.  **The "Brain" (Inference Layer):** The `NaiveBayesAuthenticator` class.
    * **Training Mode:** Learns your "Normal" behavior (Mean and Variance).
    * **Auth Mode:** Calculates the probability that new behavior belongs to the "Normal" profile.



---

### 2. Component Analysis

#### A. The Collector (`BehavioralCollector`)
This class acts as the "recorder." It doesn't judge; it just observes.

* **Keystroke Dynamics:**
    * **Dwell Time:** How long a key is pressed down ($Key_{up} - Key_{down}$).
    * **Flight Time:** The time gap between letting go of one key and pressing the next. This measures your typing rhythm.
    * **Logic:** It tracks `lastKeyTime` to calculate flight times relative to the previous action.
* **Mouse Dynamics:**
    * It samples movement and calculates **Velocity** (speed) and **Acceleration** (change in speed).
    * **Pause Detection:** It explicitly tracks "pauses" (inactivity > 500ms). This is a crucial biometric feature; some people pause while thinking, others mouse continuously.

#### B. The Feature Extractor (`NaiveBayesAuthenticator.extractFeatures`)
Raw data (thousands of events) is too noisy for simple comparison. This component condenses that data into a "fingerprint" called `BehavioralFeatures`.

It converts arrays of numbers into single metrics:
* **Mean Keystroke Dwell:** "On average, you hold keys for 120ms."
* **Mean Flight Time:** "On average, you take 50ms to move between keys."
* **Mouse Trajectory:** A custom metric calculated as $\frac{\text{Total Distance}}{\text{Count of Pauses}}$. This determines if you move in short bursts or long sweeps.

#### C. The Intelligence: Naive Bayes (`NaiveBayesAuthenticator`)
This is the core engine. It uses **Gaussian Naive Bayes**, a statistical classification algorithm.

**1. The Math (Gaussian Probability)**
The engine assumes your behavior follows a **Normal Distribution** (Bell Curve).


[Image of Gaussian distribution bell curve]


When you train the system (`train()` method), it calculates two things for every feature (like typing speed):
1.  **$\mu$ (Mean):** The center of your bell curve (your average speed).
2.  **$\sigma^2$ (Variance):** How "wide" the bell curve is (how inconsistent you are).

**2. Authentication Logic (`authenticate()` method)**
When you try to log in, the system takes your current behavior ($x$) and asks: *"What is the probability of seeing $x$ given the user's known bell curve?"*

It uses the Gaussian Probability Density Function:

$$P(x) = \frac{1}{\sqrt{2\pi\sigma^2}} \cdot e^{-\frac{(x - \mu)^2}{2\sigma^2}}$$

* If $x$ is close to the Mean ($\mu$), the probability is high (High Confidence).
* If $x$ is far from the Mean (in the "tails" of the curve), the probability is low (Low Confidence).

**3. Scoring**
It calculates this probability for *every* feature (typing speed, mouse pauses, pressure) and combines them (using Logarithms to prevent underflow) into a final `confidence` score.

---

### 3. Workflow Summary

1.  **Instantiation:** You create a `BehavioralCollector`.
2.  **Recording:** As the user types/moves, you call `recordKeystroke(...)` and `recordMouseMovement(...)`.
3.  **Submission:** When the user finishes (e.g., clicks "Submit"), you call `getCollectedData()`.
4.  **Processing:** You pass this data to `NaiveBayesAuthenticator`.
    * **If Training:** It adds the data to a history array. Once it has 10 samples, it calculates the Mean/Variance for the user.
    * **If Authenticating:** It compares the new data against the stored Mean/Variance and returns `{ isAuthentic: true/false, confidence: 0.85 }`.

### 4. Code Strengths & Weaknesses

* **Strength:** It uses **Flight Time** and **Mouse Pauses**, which are distinct biometric markers (harder to forge than simple typing speed).
* **Strength:** It uses `localStorage` to persist the model, meaning the training survives page reloads.
* **Weakness:** Naive Bayes assumes features are "independent" (e.g., it assumes your typing speed doesn't affect your mouse speed). In reality, these are often correlated, but for a lightweight engine, this assumption is acceptable.
* **Weakness:** The threshold `isAuthentic = confidence > 0.3` is static. In a production environment, this threshold usually needs to be dynamic based on the risk level of the action.

### Next Step
Would you like me to write a **React Hook** (e.g., `useBehavioralAuth`) that wraps this class logic, automatically attaching the event listeners to the window so you can simply drop it into your login form?
