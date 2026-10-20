# Transitous Depatures Integration for Gladys

## You need:

Gladys Assistent > Version 5.2

External Integration Transitous Routing

Internet Access for Your Gladys Assistant Installation

## You get:

You'll receive an external integration for Galdys Assistant. 
This integration provides you with an easy way to look up schedules for Gladys Assistant.

Example:

After clicking the button:

![Start – Beispielansicht der Transitous-Integration](../images/start.png)

a window opens with the search fields:

![Sucheingaben – Beispielansicht der Transitous-Integration](../images/start1.png)


The start field is pre-filled with your home address in Gladys. See the configuration section for more details. You can overwrite this.
The destination goes below that.
The date in the format DD - MM - YYYY, for example: 21.10.2026.
Finally, the time in the format HH-mm: 22:23.

Clicking ‘Send’ retrieves the timetables:

![Sucheingaben – Beispielansicht der Transitous-Integration](../images/start3.png)

The list provides an initial overview of the timetables found. At the same time, you will be shown, as a preliminary guide, the next mode of transport required for each route, colour-coded for your convenience.

If you now click directly on one of the routes shown, you can view the detailed information:

![Sucheingaben – Beispielansicht der Transitous-Integration](../images/start4.png)


## Configuration

1. Install the external integration either through Gladys Assistant (recommended)
 or in Gladys Assistant with direct access to GitHub.

2. After Installation check that Integration is running.
   
3. Open your Dashboard and go into Edit Modus and there add the new Widget.
   Select this Integration Widget.
   
4. When adding the widget to your dashboard, you’ll need some information:
   
a.) Your geolocation as the starting point
 (or choose location from Gladys Assistant)
 
b.) The diameter of the search radius.

c.) The refresh interval in 10-minute increments.

d.) A unique identifier for API access at https://transitous.org/.
This identifier must be unique—for example, an email address or website.
It is stored by the integration only in the configuration field there.
The integration neither retrieves nor documents this identifier.
Everything remains with you. Transitous.org uses this identifier to manage the load on its IT infrastructure.
Keep in mind the data provider when setting this. We recommend 15 minutes.

8. After filling out this information, save it and place the widget where you want it.


## Troubleshooting

The integration logs everything it does: check the integration logs from the
Gladys UI (or `docker logs` on the host) with `LOG_LEVEL=debug` for the full
detail.
