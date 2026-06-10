import WidgetKit
import SwiftUI

struct CaloriesEntry: TimelineEntry {
    let date: Date
    let caloriesLeft: Int
}

struct CaloriesProvider: TimelineProvider {
    private let suiteName = "group.com.siwebai.nutria"

    func placeholder(in context: Context) -> CaloriesEntry {
        CaloriesEntry(date: Date(), caloriesLeft: 2000)
    }

    func getSnapshot(in context: Context, completion: @escaping (CaloriesEntry) -> Void) {
        let val = UserDefaults(suiteName: suiteName)?.integer(forKey: "caloriesLeft") ?? 0
        completion(CaloriesEntry(date: Date(), caloriesLeft: max(0, val == 0 ? 2000 : val)))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<CaloriesEntry>) -> Void) {
        let val = UserDefaults(suiteName: suiteName)?.integer(forKey: "caloriesLeft") ?? 0
        let entry = CaloriesEntry(date: Date(), caloriesLeft: max(0, val == 0 ? 2000 : val))
        let next = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

private let bgGradient = LinearGradient(
    colors: [
        Color(red: 0.16, green: 0.11, blue: 0.05),
        Color(red: 0.05, green: 0.03, blue: 0.02),
    ],
    startPoint: .topLeading,
    endPoint: .bottomTrailing
)

struct NutrIAWidgetView: View {
    let entry: CaloriesEntry

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            // Calories — sin círculo
            VStack(spacing: 4) {
                Text("\(entry.caloriesLeft)")
                    .font(.system(size: 36, weight: .bold))
                    .foregroundColor(.white)
                Text("Calorías restantes")
                    .font(.system(size: 11))
                    .foregroundColor(Color.white.opacity(0.65))
            }

            Spacer()

            Rectangle()
                .fill(Color.white.opacity(0.12))
                .frame(height: 0.5)
                .padding(.horizontal, 14)

            // Log your food row
            HStack(spacing: 8) {
                ZStack {
                    Circle()
                        .fill(Color.white)
                        .frame(width: 26, height: 26)
                    Image(systemName: "plus")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(Color(red: 0, green: 0, blue: 0))
                }
                Text("Registrar comida")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Color.white.opacity(0.9))
                    .fixedSize()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 14)
            .padding(.vertical, 11)
        }
        .widgetURL(URL(string: "nutria://scanner"))
    }
}

@main
struct NutrIAWidget: Widget {
    let kind = "NutrIAWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: CaloriesProvider()) { entry in
            if #available(iOSApplicationExtension 17.0, *) {
                NutrIAWidgetView(entry: entry)
                    .containerBackground(bgGradient, for: .widget)
            } else {
                ZStack {
                    bgGradient
                    NutrIAWidgetView(entry: entry)
                }
            }
        }
        .configurationDisplayName("NutrIA")
        .description("Calorías restantes del día.")
        .supportedFamilies([.systemSmall])
    }
}
