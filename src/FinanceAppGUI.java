import javax.swing.*;
import javax.swing.event.DocumentEvent;
import javax.swing.event.DocumentListener;
import javax.swing.table.DefaultTableModel;
import javax.swing.table.TableRowSorter;
import java.awt.*;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import java.awt.geom.Arc2D;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.*;

enum TransactionType {
    INCOME, EXPENSE
}

class Transaction {
    private static int idCounter = 1;
    private final int id;
    private String description;
    private double amount;
    private String category;
    private TransactionType type;
    private LocalDate date;

    public Transaction(String description, double amount, String category, TransactionType type) {
        this.id = idCounter++;
        this.description = description;
        this.amount = amount;
        this.category = category;
        this.type = type;
        this.date = LocalDate.now();
    }

    public Transaction(int id, String description, double amount, String category, TransactionType type, LocalDate date) {
        this.id = id;
        this.description = description;
        this.amount = amount;
        this.category = category;
        this.type = type;
        this.date = date;
        if (id >= idCounter) idCounter = id + 1;
    }

    public int getId() { return id; }
    public String getDescription() { return description; }
    public double getAmount() { return amount; }
    public String getCategory() { return category; }
    public TransactionType getType() { return type; }
    public LocalDate getDate() { return date; }

    public String toFileString() {
        return String.format(Locale.US, "TRANSACTION;%d;%s;%.2f;%s;%s;%s",
                id, description, amount, category, type.name(), date.toString());
    }
}

class FinanceManager {
    private final List<Transaction> transactions = new ArrayList<>();
    private final Map<String, Double> categoryBudgets = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
    private double initialBalance = 0.0;

    public List<Transaction> getTransactions() { return transactions; }

    public double getInitialBalance() { return initialBalance; }
    public void setInitialBalance(double initialBalance) { this.initialBalance = initialBalance; }

    public String addTransaction(Transaction transaction) {
        transactions.add(transaction);
        if (transaction.getType() == TransactionType.EXPENSE) {
            return checkBudgetAlert(transaction.getCategory());
        }
        return null;
    }

    public boolean deleteTransactionById(int id) {
        return transactions.removeIf(t -> t.getId() == id);
    }

    public String updateTransaction(int id, String description, double amount, String category, TransactionType type) {
        for (int i = 0; i < transactions.size(); i++) {
            Transaction old = transactions.get(i);
            if (old.getId() == id) {
                Transaction updated = new Transaction(id, description, amount, category, type, old.getDate());
                transactions.set(i, updated);
                if (type == TransactionType.EXPENSE) {
                    return checkBudgetAlert(category);
                }
                return null;
            }
        }
        return null;
    }

    public void setCategoryBudget(String category, double limit) {
        categoryBudgets.put(category, limit);
    }

    public Map<String, Double> getCategoryBudgets() {
        return Collections.unmodifiableMap(categoryBudgets);
    }

    private String checkBudgetAlert(String category) {
        if (!categoryBudgets.containsKey(category)) return null;

        double limit = categoryBudgets.get(category);
        double currentSpent = getCategorySpent(category);

        if (currentSpent > limit) {
            return String.format(Locale.US, "'%s' kategorisinde bütçe limitini (%.2f TL) aştınız! Toplam: %.2f TL", category, limit, currentSpent);
        } else if (currentSpent >= limit * 0.8) {
            return String.format(Locale.US, "'%s' harcaması bütçe limitinin %%80'ine ulaştı. Toplam: %.2f TL", category, currentSpent);
        }
        return null;
    }

    public double getCategorySpent(String category) {
        return transactions.stream()
                .filter(t -> t.getType() == TransactionType.EXPENSE)
                .filter(t -> t.getCategory().equalsIgnoreCase(category))
                .mapToDouble(Transaction::getAmount)
                .sum();
    }

    public List<String> getKnownCategories() {
        Set<String> set = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        for (Transaction t : transactions) set.add(t.getCategory());
        return new ArrayList<>(set);
    }

    public List<String> getAvailableMonths() {
        Set<String> months = new TreeSet<>(Comparator.reverseOrder());
        for (Transaction t : transactions) {
            months.add(t.getDate().toString().substring(0, 7));
        }
        return new ArrayList<>(months);
    }

    public Map<String, Double> getExpenseByCategory() {
        Map<String, Double> map = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
        for (Transaction t : transactions) {
            if (t.getType() == TransactionType.EXPENSE) {
                map.merge(t.getCategory(), t.getAmount(), Double::sum);
            }
        }
        return map;
    }

    public Map<String, double[]> getMonthlyTotals() {
        Map<String, double[]> map = new TreeMap<>();
        for (Transaction t : transactions) {
            String month = t.getDate().toString().substring(0, 7);
            double[] arr = map.computeIfAbsent(month, k -> new double[2]);
            if (t.getType() == TransactionType.INCOME) arr[0] += t.getAmount();
            else arr[1] += t.getAmount();
        }
        return map;
    }

    public double getTotalIncome() {
        return transactions.stream().filter(t -> t.getType() == TransactionType.INCOME).mapToDouble(Transaction::getAmount).sum();
    }

    public double getTotalExpense() {
        return transactions.stream().filter(t -> t.getType() == TransactionType.EXPENSE).mapToDouble(Transaction::getAmount).sum();
    }

    public double getNetBalance() {
        return initialBalance + getTotalIncome() - getTotalExpense();
    }

    public void saveDataToFile(String filePath) {
        try (BufferedWriter writer = new BufferedWriter(
                new OutputStreamWriter(new FileOutputStream(filePath), StandardCharsets.UTF_8))) {
            writer.write(String.format(Locale.US, "INITIAL_BALANCE;%.2f%n", initialBalance));
            for (Map.Entry<String, Double> entry : categoryBudgets.entrySet()) {
                writer.write(String.format(Locale.US, "BUDGET;%s;%.2f%n", entry.getKey(), entry.getValue()));
            }
            for (Transaction t : transactions) {
                writer.write(t.toFileString());
                writer.newLine();
            }
        } catch (IOException ex) {
            System.err.println("Veri kaydedilemedi: " + ex.getMessage());
        }
    }

    public void loadDataFromFile(String filePath) {
        File file = new File(filePath);
        if (!file.exists()) return;
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(new FileInputStream(filePath), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.trim().isEmpty()) continue;
                try {
                    String[] parts = line.split(";");
                    if ("INITIAL_BALANCE".equals(parts[0])) {
                        initialBalance = Double.parseDouble(parts[1].replace(",", "."));
                    } else if ("BUDGET".equals(parts[0])) {
                        categoryBudgets.put(parts[1], Double.parseDouble(parts[2].replace(",", ".")));
                    } else if ("TRANSACTION".equals(parts[0])) {
                        transactions.add(new Transaction(
                                Integer.parseInt(parts[1]), parts[2],
                                Double.parseDouble(parts[3].replace(",", ".")),
                                parts[4], TransactionType.valueOf(parts[5]), LocalDate.parse(parts[6])
                        ));
                    }
                } catch (Exception ex) {
                    System.err.println("Bozuk satır atlandı: " + line);
                }
            }
        } catch (Exception ex) {
            System.err.println("Veri yüklenemedi: " + ex.getMessage());
        }
    }

    public void exportToCSV(File targetFile) throws IOException {
        try (PrintWriter writer = new PrintWriter(new OutputStreamWriter(new FileOutputStream(targetFile), StandardCharsets.UTF_8))) {
            writer.write('\ufeff');
            writer.println("ID;Tarih;İşlem Türü;Kategori;Tutar (TL);Açıklama");
            for (Transaction t : transactions) {
                writer.println(String.format(Locale.US, "%d;%s;%s;%s;%.2f;%s",
                        t.getId(),
                        t.getDate(),
                        t.getType() == TransactionType.INCOME ? "GELİR" : "GİDER",
                        t.getCategory(),
                        t.getAmount(),
                        t.getDescription().replace(";", ",")
                ));
            }
        }
    }
}

public class FinanceAppGUI extends JFrame {
    private final FinanceManager manager = new FinanceManager();

    private static final String DATA_DIR = System.getProperty("user.home") + File.separator + ".finansapp";
    private final String DATA_FILE = DATA_DIR + File.separator + "data.txt";

    private boolean darkMode = true;
    private Color bg, panelBg, text, inputBg, buttonBg, gridColor, selectionBg;

    private final Color[] CHART_PALETTE = {
            new Color(52, 152, 219), new Color(231, 76, 60), new Color(46, 204, 113),
            new Color(241, 196, 15), new Color(155, 89, 182), new Color(230, 126, 34),
            new Color(26, 188, 156), new Color(149, 165, 166), new Color(211, 84, 0),
            new Color(41, 128, 185)
    };

    private DefaultTableModel tableModel;
    private TableRowSorter<DefaultTableModel> rowSorter;
    private JTable table;
    private JLabel lblIncome, lblExpense, lblBalance, lblCount;
    private JTextField txtDesc, txtAmount, txtBudgetCat, txtBudgetLimit, txtSearch, txtInitialBalance;
    private JComboBox<String> cmbType;
    private JComboBox<String> cmbCategory;
    private JComboBox<String> cmbMonthFilter;
    private JButton btnAdd, btnClearForm, btnThemeToggle;
    private JPanel summaryPanel, inputPanel;

    private Integer editingId = null;

    public FinanceAppGUI() {
        setTitle("Kişisel Gelir Gider Hesaplama");
        setSize(1100, 720);
        setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        setLocationRelativeTo(null);

        applyPalette();
        setLayout(new BorderLayout(10, 10));

        new File(DATA_DIR).mkdirs();
        manager.loadDataFromFile(DATA_FILE);

        initUI();
        updateTableAndSummary();
        applyTheme(getContentPane());

        addWindowListener(new java.awt.event.WindowAdapter() {
            @Override
            public void windowClosing(java.awt.event.WindowEvent windowEvent) {
                manager.saveDataToFile(DATA_FILE);
            }
        });
    }

    private void applyPalette() {
        if (darkMode) {
            bg = new Color(30, 30, 30);
            panelBg = new Color(45, 45, 45);
            text = new Color(220, 220, 220);
            inputBg = new Color(60, 60, 60);
            buttonBg = new Color(70, 70, 70);
            gridColor = new Color(70, 70, 70);
            selectionBg = new Color(100, 100, 100);
        } else {
            bg = new Color(240, 240, 240);
            panelBg = Color.WHITE;
            text = new Color(25, 25, 25);
            inputBg = new Color(255, 255, 255);
            buttonBg = new Color(225, 225, 225);
            gridColor = new Color(210, 210, 210);
            selectionBg = new Color(190, 215, 245);
        }
    }

    private void applyTheme(Container root) {
        getContentPane().setBackground(bg);
        for (Component c : root.getComponents()) {
            boolean keep = (c instanceof JComponent) && Boolean.TRUE.equals(((JComponent) c).getClientProperty("keepColor"));

            if (!keep) {
                if (c instanceof JPanel) {
                    c.setBackground(panelBg);
                } else if (c instanceof JLabel) {
                    c.setForeground(text);
                } else if (c instanceof JButton) {
                    c.setBackground(buttonBg);
                    c.setForeground(text);
                }
            }

            if (c instanceof JTextField) {
                c.setBackground(inputBg);
                c.setForeground(text);
                ((JTextField) c).setCaretColor(text);
            } else if (c instanceof JComboBox) {
                c.setBackground(inputBg);
                c.setForeground(text);
            } else if (c instanceof JTable) {
                JTable t = (JTable) c;
                t.setBackground(panelBg);
                t.setForeground(text);
                t.setGridColor(gridColor);
                t.setSelectionBackground(selectionBg);
                t.getTableHeader().setBackground(inputBg);
                t.getTableHeader().setForeground(text);
            } else if (c instanceof JScrollPane) {
                ((JScrollPane) c).getViewport().setBackground(panelBg);
            } else if (c instanceof JTextArea) {
                c.setBackground(inputBg);
                c.setForeground(text);
            }

            if (c instanceof Container) {
                applyTheme((Container) c);
            }
        }

        if (summaryPanel != null) {
            summaryPanel.setBorder(BorderFactory.createTitledBorder(
                    BorderFactory.createLineBorder(text), "Hesap Özeti", 0, 0, null, text));
        }
        if (inputPanel != null) {
            inputPanel.setBorder(BorderFactory.createTitledBorder(
                    BorderFactory.createLineBorder(text), "İşlemler & Ayarlar", 0, 0, null, text));
        }
        repaint();
    }

    private void toggleTheme() {
        darkMode = !darkMode;
        applyPalette();
        applyTheme(getContentPane());
        btnThemeToggle.setText(darkMode ? "☀ Açık Moda Geç" : "🌙 Koyu Moda Geç");
    }

    private void initUI() {
        JPanel topContainer = new JPanel(new BorderLayout(5, 5));

        summaryPanel = new JPanel(new GridLayout(1, 4, 10, 10));
        summaryPanel.setBorder(BorderFactory.createTitledBorder(
                BorderFactory.createLineBorder(text), "Hesap Özeti", 0, 0, null, text));

        lblIncome = new JLabel("Toplam Gelir: 0.00 TL", SwingConstants.CENTER);
        lblIncome.setForeground(new Color(46, 204, 113));
        lblIncome.setFont(new Font("Arial", Font.BOLD, 14));
        lblIncome.putClientProperty("keepColor", Boolean.TRUE);

        lblExpense = new JLabel("Toplam Gider: 0.00 TL", SwingConstants.CENTER);
        lblExpense.setForeground(new Color(231, 76, 60));
        lblExpense.setFont(new Font("Arial", Font.BOLD, 14));
        lblExpense.putClientProperty("keepColor", Boolean.TRUE);

        lblBalance = new JLabel("Net Bakiye: 0.00 TL", SwingConstants.CENTER);
        lblBalance.setFont(new Font("Arial", Font.BOLD, 14));

        lblCount = new JLabel("İşlem Sayısı: 0", SwingConstants.CENTER);
        lblCount.setFont(new Font("Arial", Font.BOLD, 14));

        summaryPanel.add(lblIncome);
        summaryPanel.add(lblExpense);
        summaryPanel.add(lblBalance);
        summaryPanel.add(lblCount);
        topContainer.add(summaryPanel, BorderLayout.NORTH);

        JPanel searchPanel = new JPanel(new BorderLayout(10, 0));
        searchPanel.setBorder(BorderFactory.createEmptyBorder(5, 10, 5, 10));

        JLabel lblSearch = new JLabel("Canlı Ara (Kategori / Açıklama): ");
        lblSearch.setFont(new Font("Arial", Font.BOLD, 12));
        searchPanel.add(lblSearch, BorderLayout.WEST);

        txtSearch = new JTextField();
        searchPanel.add(txtSearch, BorderLayout.CENTER);

        JPanel rightControls = new JPanel(new FlowLayout(FlowLayout.RIGHT, 8, 0));

        JLabel lblMonth = new JLabel("Ay: ");
        rightControls.add(lblMonth);
        cmbMonthFilter = new JComboBox<>(new String[]{"Tümü"});
        cmbMonthFilter.addActionListener(e -> applyFilters());
        rightControls.add(cmbMonthFilter);

        btnThemeToggle = createStyledButton("☀ Açık Moda Geç");
        btnThemeToggle.addActionListener(e -> toggleTheme());
        rightControls.add(btnThemeToggle);

        searchPanel.add(rightControls, BorderLayout.EAST);

        topContainer.add(searchPanel, BorderLayout.SOUTH);
        add(topContainer, BorderLayout.NORTH);

        String[] columns = {"ID", "Tarih", "Tür", "Kategori", "Tutar (TL)", "Açıklama"};
        tableModel = new DefaultTableModel(columns, 0) {
            @Override
            public boolean isCellEditable(int row, int column) { return false; }
        };

        table = new JTable(tableModel);
        rowSorter = new TableRowSorter<>(tableModel);

        rowSorter.setComparator(4, (a, b) -> {
            try {
                double da = Double.parseDouble(a.toString().replace(",", "."));
                double db = Double.parseDouble(b.toString().replace(",", "."));
                return Double.compare(da, db);
            } catch (Exception ex) {
                return 0;
            }
        });

        table.setRowSorter(rowSorter);
        table.setSelectionForeground(Color.WHITE);
        table.getTableHeader().setFont(new Font("Arial", Font.BOLD, 12));

        table.addMouseListener(new MouseAdapter() {
            @Override
            public void mouseClicked(MouseEvent e) {
                if (e.getClickCount() == 2) {
                    loadSelectedIntoFormForEdit();
                }
            }
        });

        JScrollPane scrollPane = new JScrollPane(table);
        add(scrollPane, BorderLayout.CENTER);

        txtSearch.getDocument().addDocumentListener(new DocumentListener() {
            @Override public void insertUpdate(DocumentEvent e) { applyFilters(); }
            @Override public void removeUpdate(DocumentEvent e) { applyFilters(); }
            @Override public void changedUpdate(DocumentEvent e) { applyFilters(); }
        });

        inputPanel = new JPanel(new GridLayout(13, 2, 5, 5));
        inputPanel.setBorder(BorderFactory.createTitledBorder(
                BorderFactory.createLineBorder(text), "İşlemler & Ayarlar", 0, 0, null, text));

        txtInitialBalance = new JTextField(String.valueOf(manager.getInitialBalance()));
        addFormLabel(inputPanel, "Başlangıç Bakiyesi:");
        inputPanel.add(txtInitialBalance);

        JButton btnSetInitialBalance = createStyledButton("Bakiyeyi Güncelle");
        btnSetInitialBalance.addActionListener(e -> setInitialBalanceAction());
        inputPanel.add(btnSetInitialBalance);
        inputPanel.add(new JLabel(""));

        cmbType = new JComboBox<>(new String[]{"Gider", "Gelir"});

        txtDesc = new JTextField();
        txtAmount = new JTextField();

        cmbCategory = new JComboBox<>();
        cmbCategory.setEditable(true);
        refreshCategoryCombo(null);

        txtBudgetCat = new JTextField();
        txtBudgetLimit = new JTextField();

        addFormLabel(inputPanel, "İşlem Türü:");
        inputPanel.add(cmbType);

        addFormLabel(inputPanel, "Açıklama:");
        inputPanel.add(txtDesc);

        addFormLabel(inputPanel, "Tutar (TL):");
        inputPanel.add(txtAmount);

        addFormLabel(inputPanel, "Kategori:");
        inputPanel.add(cmbCategory);

        btnAdd = createStyledButton("İşlem Ekle");
        btnAdd.addActionListener(e -> addOrUpdateTransactionAction());
        inputPanel.add(btnAdd);

        txtDesc.addActionListener(e -> addOrUpdateTransactionAction());
        txtAmount.addActionListener(e -> addOrUpdateTransactionAction());

        btnClearForm = createStyledButton("Temizle / İptal");
        btnClearForm.addActionListener(e -> resetForm());
        inputPanel.add(btnClearForm);

        JButton btnDelete = createStyledButton("Seçiliyi Sil");
        btnDelete.addActionListener(e -> deleteTransactionAction());
        inputPanel.add(btnDelete);

        JButton btnEdit = createStyledButton("Seçiliyi Düzenle");
        btnEdit.addActionListener(e -> loadSelectedIntoFormForEdit());
        inputPanel.add(btnEdit);

        addFormLabel(inputPanel, "Bütçe Kategori:");
        inputPanel.add(txtBudgetCat);

        addFormLabel(inputPanel, "Limit Tutarı:");
        inputPanel.add(txtBudgetLimit);

        JButton btnSetBudget = createStyledButton("Bütçe Limiti Koy");
        btnSetBudget.addActionListener(e -> setBudgetAction());
        inputPanel.add(btnSetBudget);

        JButton btnBudgetOverview = createStyledButton("Bütçe Özeti");
        btnBudgetOverview.addActionListener(e -> showBudgetOverview());
        inputPanel.add(btnBudgetOverview);

        JButton btnExport = createStyledButton("CSV Dışa Aktar");
        btnExport.setBackground(new Color(41, 128, 185));
        btnExport.setForeground(Color.WHITE);
        btnExport.putClientProperty("keepColor", Boolean.TRUE);
        btnExport.addActionListener(e -> exportCSVAction());
        inputPanel.add(btnExport);

        JButton btnShowChart = createStyledButton("Kategori Grafiği");
        btnShowChart.setBackground(new Color(142, 68, 173));
        btnShowChart.setForeground(Color.WHITE);
        btnShowChart.putClientProperty("keepColor", Boolean.TRUE);
        btnShowChart.addActionListener(e -> showCategoryChart());
        inputPanel.add(btnShowChart);

        JButton btnTrendChart = createStyledButton("Aylık Trend Grafiği");
        btnTrendChart.setBackground(new Color(39, 174, 96));
        btnTrendChart.setForeground(Color.WHITE);
        btnTrendChart.putClientProperty("keepColor", Boolean.TRUE);
        btnTrendChart.addActionListener(e -> showTrendChart());
        inputPanel.add(btnTrendChart);
        inputPanel.add(new JLabel(""));

        add(inputPanel, BorderLayout.WEST);
    }

    private void applyFilters() {
        List<RowFilter<Object, Object>> filters = new ArrayList<>();

        String text = txtSearch.getText().trim();
        if (!text.isEmpty()) {
            filters.add(RowFilter.regexFilter("(?i)" + java.util.regex.Pattern.quote(text), 3, 5));
        }

        String month = (String) cmbMonthFilter.getSelectedItem();
        if (month != null && !month.equals("Tümü")) {
            filters.add(new RowFilter<Object, Object>() {
                @Override
                public boolean include(Entry<? extends Object, ? extends Object> entry) {
                    Object val = entry.getValue(1);
                    return val != null && val.toString().startsWith(month);
                }
            });
        }

        if (filters.isEmpty()) {
            rowSorter.setRowFilter(null);
        } else {
            rowSorter.setRowFilter(RowFilter.andFilter(filters));
        }
    }

    private void refreshCategoryCombo(String keepText) {
        List<String> categories = manager.getKnownCategories();
        String current = keepText != null ? keepText : (String) cmbCategory.getEditor().getItem();
        cmbCategory.setModel(new DefaultComboBoxModel<>(categories.toArray(new String[0])));
        cmbCategory.setSelectedItem(null);
        cmbCategory.getEditor().setItem(current == null ? "" : current);
    }

    private void refreshMonthCombo() {
        String previouslySelected = (String) cmbMonthFilter.getSelectedItem();
        List<String> months = manager.getAvailableMonths();
        List<String> items = new ArrayList<>();
        items.add("Tümü");
        items.addAll(months);
        cmbMonthFilter.setModel(new DefaultComboBoxModel<>(items.toArray(new String[0])));
        if (previouslySelected != null && items.contains(previouslySelected)) {
            cmbMonthFilter.setSelectedItem(previouslySelected);
        } else {
            cmbMonthFilter.setSelectedItem("Tümü");
        }
    }

    private void loadSelectedIntoFormForEdit() {
        int selectedRow = table.getSelectedRow();
        if (selectedRow == -1) {
            JOptionPane.showMessageDialog(this, "Düzenlemek için tablodan bir işlem seçin.", "Bilgi", JOptionPane.INFORMATION_MESSAGE);
            return;
        }
        int modelRow = table.convertRowIndexToModel(selectedRow);
        int id = (int) tableModel.getValueAt(modelRow, 0);
        Transaction t = manager.getTransactions().stream().filter(tt -> tt.getId() == id).findFirst().orElse(null);
        if (t == null) return;

        editingId = id;
        txtDesc.setText(t.getDescription());
        txtAmount.setText(String.format(Locale.US, "%.2f", t.getAmount()));
        cmbCategory.getEditor().setItem(t.getCategory());
        cmbType.setSelectedItem(t.getType() == TransactionType.INCOME ? "Gelir" : "Gider");
        btnAdd.setText("Değişiklikleri Kaydet");
    }

    private void resetForm() {
        editingId = null;
        txtDesc.setText("");
        txtAmount.setText("");
        cmbCategory.getEditor().setItem("");
        cmbType.setSelectedItem("Gider");
        btnAdd.setText("İşlem Ekle");
    }

    private void setInitialBalanceAction() {
        try {
            double amount = Double.parseDouble(txtInitialBalance.getText().trim().replace(",", "."));
            manager.setInitialBalance(amount);
            updateTableAndSummary();
            JOptionPane.showMessageDialog(this, String.format(Locale.US, "Başlangıç bakiyesi %.2f TL olarak ayarlandı.", amount), "Başarılı", JOptionPane.INFORMATION_MESSAGE);
        } catch (NumberFormatException ex) {
            JOptionPane.showMessageDialog(this, "Geçerli bir başlangıç bakiyesi giriniz!", "Hata", JOptionPane.ERROR_MESSAGE);
        }
    }

    private void exportCSVAction() {
        if (manager.getTransactions().isEmpty()) {
            JOptionPane.showMessageDialog(this, "Dışa aktarılacak işlem bulunamadı!", "Uyarı", JOptionPane.WARNING_MESSAGE);
            return;
        }

        JFileChooser fileChooser = new JFileChooser();
        fileChooser.setDialogTitle("CSV Dosyasını Kaydet");
        fileChooser.setSelectedFile(new File("finans_raporu.csv"));

        int userSelection = fileChooser.showSaveDialog(this);
        if (userSelection == JFileChooser.APPROVE_OPTION) {
            File fileToSave = fileChooser.getSelectedFile();
            if (!fileToSave.getAbsolutePath().endsWith(".csv")) {
                fileToSave = new File(fileToSave.getAbsolutePath() + ".csv");
            }

            try {
                manager.exportToCSV(fileToSave);
                JOptionPane.showMessageDialog(this, "Veriler başarıyla aktarıldı:\n" + fileToSave.getAbsolutePath(), "Başarılı", JOptionPane.INFORMATION_MESSAGE);
            } catch (IOException ex) {
                JOptionPane.showMessageDialog(this, "CSV yazılırken bir hata oluştu: " + ex.getMessage(), "Hata", JOptionPane.ERROR_MESSAGE);
            }
        }
    }

    private void addFormLabel(JPanel panel, String labelText) {
        JLabel label = new JLabel(labelText);
        panel.add(label);
    }

    private JButton createStyledButton(String text) {
        JButton btn = new JButton(text);
        btn.setFocusPainted(false);
        btn.setBorder(BorderFactory.createLineBorder(new Color(100, 100, 100)));
        return btn;
    }

    private void addOrUpdateTransactionAction() {
        try {
            String desc = txtDesc.getText().trim();
            String amountText = txtAmount.getText().trim().replace(",", ".");
            String category = cmbCategory.getEditor().getItem() == null ? "" : cmbCategory.getEditor().getItem().toString().trim();
            TransactionType type = cmbType.getSelectedItem().equals("Gelir") ? TransactionType.INCOME : TransactionType.EXPENSE;

            if (desc.isEmpty() || category.isEmpty() || amountText.isEmpty()) {
                JOptionPane.showMessageDialog(this, "Lütfen tüm alanları doldurun!", "Uyarı", JOptionPane.WARNING_MESSAGE);
                return;
            }

            double amount = Double.parseDouble(amountText);
            if (amount <= 0) {
                JOptionPane.showMessageDialog(this, "Tutar 0'dan büyük olmalıdır!", "Uyarı", JOptionPane.WARNING_MESSAGE);
                return;
            }

            String alertMsg;
            if (editingId != null) {
                alertMsg = manager.updateTransaction(editingId, desc, amount, category, type);
            } else {
                alertMsg = manager.addTransaction(new Transaction(desc, amount, category, type));
            }

            if (alertMsg != null) {
                JOptionPane.showMessageDialog(this, alertMsg, "Bütçe Uyarısı", JOptionPane.WARNING_MESSAGE);
            }

            updateTableAndSummary();
            resetForm();
        } catch (NumberFormatException ex) {
            JOptionPane.showMessageDialog(this, "Geçerli bir tutar giriniz!", "Hata", JOptionPane.ERROR_MESSAGE);
        }
    }

    private void deleteTransactionAction() {
        int selectedRow = table.getSelectedRow();
        if (selectedRow == -1) {
            JOptionPane.showMessageDialog(this, "Lütfen silmek için tablodan bir işlem seçin.", "Bilgi", JOptionPane.INFORMATION_MESSAGE);
            return;
        }

        int confirm = JOptionPane.showConfirmDialog(this,
                "Seçili işlemi silmek istediğinize emin misiniz?", "Onay",
                JOptionPane.YES_NO_OPTION, JOptionPane.QUESTION_MESSAGE);
        if (confirm != JOptionPane.YES_OPTION) return;

        int modelRow = table.convertRowIndexToModel(selectedRow);
        int id = (int) tableModel.getValueAt(modelRow, 0);
        manager.deleteTransactionById(id);
        if (editingId != null && editingId == id) resetForm();
        updateTableAndSummary();
    }

    private void setBudgetAction() {
        String cat = txtBudgetCat.getText().trim();
        if (cat.isEmpty()) {
            JOptionPane.showMessageDialog(this, "Kategori adı boş olamaz!", "Uyarı", JOptionPane.WARNING_MESSAGE);
            return;
        }
        try {
            double limit = Double.parseDouble(txtBudgetLimit.getText().trim().replace(",", "."));
            if (limit <= 0) {
                JOptionPane.showMessageDialog(this, "Limit 0'dan büyük olmalıdır!", "Uyarı", JOptionPane.WARNING_MESSAGE);
                return;
            }
            manager.setCategoryBudget(cat, limit);
            JOptionPane.showMessageDialog(this, String.format(Locale.US, "'%s' kategorisine %.2f TL limit tanımlandı.", cat, limit));
            txtBudgetCat.setText("");
            txtBudgetLimit.setText("");
        } catch (NumberFormatException ex) {
            JOptionPane.showMessageDialog(this, "Geçerli bir limit giriniz!", "Hata", JOptionPane.ERROR_MESSAGE);
        }
    }

    private void showBudgetOverview() {
        Map<String, Double> budgets = manager.getCategoryBudgets();
        if (budgets.isEmpty()) {
            JOptionPane.showMessageDialog(this, "Henüz tanımlı bir bütçe limiti yok.", "Bütçe Özeti", JOptionPane.INFORMATION_MESSAGE);
            return;
        }

        JTextArea area = new JTextArea(15, 45);
        area.setEditable(false);
        area.setBackground(inputBg);
        area.setForeground(text);
        area.setFont(new Font(Font.MONOSPACED, Font.PLAIN, 13));

        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, Double> entry : budgets.entrySet()) {
            String category = entry.getKey();
            double limit = entry.getValue();
            double spent = manager.getCategorySpent(category);
            double remaining = limit - spent;
            String status;
            if (spent > limit) status = "AŞILDI";
            else if (spent >= limit * 0.8) status = "Yaklaşıyor";
            else status = "Normal";

            sb.append(String.format(Locale.US, "%-15s  Limit: %8.2f  Harcanan: %8.2f  Kalan: %8.2f  [%s]%n",
                    category, limit, spent, remaining, status));
        }
        area.setText(sb.toString());

        JScrollPane sp = new JScrollPane(area);
        JOptionPane.showMessageDialog(this, sp, "Bütçe Özeti", JOptionPane.PLAIN_MESSAGE);
    }

    private void showCategoryChart() {
        Map<String, Double> expenseByCategory = manager.getExpenseByCategory();
        if (expenseByCategory.isEmpty()) {
            JOptionPane.showMessageDialog(this, "Grafik oluşturmak için önce gider işlemi ekleyin.", "Bilgi", JOptionPane.INFORMATION_MESSAGE);
            return;
        }

        JDialog dialog = new JDialog(this, "Kategori Bazlı Gider Dağılımı", true);
        dialog.setSize(560, 480);
        dialog.setLocationRelativeTo(this);
        dialog.getContentPane().setBackground(bg);
        dialog.add(new PieChartPanel(expenseByCategory));
        dialog.setVisible(true);
    }

    private void showTrendChart() {
        Map<String, double[]> monthly = manager.getMonthlyTotals();
        if (monthly.isEmpty()) {
            JOptionPane.showMessageDialog(this, "Grafik oluşturmak için önce işlem ekleyin.", "Bilgi", JOptionPane.INFORMATION_MESSAGE);
            return;
        }

        JDialog dialog = new JDialog(this, "Aylık Gelir / Gider Trend Grafiği", true);
        dialog.setSize(700, 480);
        dialog.setLocationRelativeTo(this);
        dialog.getContentPane().setBackground(bg);
        dialog.add(new TrendChartPanel(monthly));
        dialog.setVisible(true);
    }

    private void updateTableAndSummary() {
        tableModel.setRowCount(0);
        for (Transaction t : manager.getTransactions()) {
            tableModel.addRow(new Object[]{
                    t.getId(), t.getDate(),
                    (t.getType() == TransactionType.INCOME ? "GELİR" : "GİDER"),
                    t.getCategory(), String.format(Locale.US, "%.2f", t.getAmount()), t.getDescription()
            });
        }

        lblIncome.setText(String.format(Locale.US, "Toplam Gelir: %.2f TL", manager.getTotalIncome()));
        lblExpense.setText(String.format(Locale.US, "Toplam Gider: %.2f TL", manager.getTotalExpense()));
        lblBalance.setText(String.format(Locale.US, "Net Bakiye: %.2f TL", manager.getNetBalance()));
        lblCount.setText(String.format(Locale.US, "İşlem Sayısı: %d", manager.getTransactions().size()));

        refreshCategoryCombo("");
        refreshMonthCombo();
        applyFilters();
    }

    private class PieChartPanel extends JPanel {
        private final Map<String, Double> data;

        PieChartPanel(Map<String, Double> data) {
            this.data = data;
            setBackground(bg);
        }

        @Override
        protected void paintComponent(Graphics g) {
            super.paintComponent(g);
            Graphics2D g2 = (Graphics2D) g;
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

            double total = data.values().stream().mapToDouble(Double::doubleValue).sum();
            if (total <= 0) return;

            int diameter = Math.min(getWidth() - 220, getHeight() - 40);
            diameter = Math.max(diameter, 100);
            int x = 20, y = 20;

            double startAngle = 90;
            int colorIndex = 0;
            int legendY = 25;

            for (Map.Entry<String, Double> entry : data.entrySet()) {
                double value = entry.getValue();
                double angle = (value / total) * 360.0;
                Color color = CHART_PALETTE[colorIndex % CHART_PALETTE.length];

                g2.setColor(color);
                Arc2D.Double arc = new Arc2D.Double(x, y, diameter, diameter, startAngle, -angle, Arc2D.PIE);
                g2.fill(arc);
                startAngle -= angle;

                int legendX = diameter + 50;
                g2.setColor(color);
                g2.fillRect(legendX, legendY, 14, 14);
                g2.setColor(text);
                double percent = (value / total) * 100.0;
                g2.drawString(String.format(Locale.US, "%s: %.2f TL (%%%.1f)", entry.getKey(), value, percent),
                        legendX + 20, legendY + 12);
                legendY += 22;
                colorIndex++;
            }

            g2.setColor(text);
            g2.drawOval(x, y, diameter, diameter);
        }
    }

    private class TrendChartPanel extends JPanel {
        private final Map<String, double[]> data;

        TrendChartPanel(Map<String, double[]> data) {
            this.data = data;
            setBackground(bg);
        }

        @Override
        protected void paintComponent(Graphics g) {
            super.paintComponent(g);
            Graphics2D g2 = (Graphics2D) g;
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

            if (data.isEmpty()) return;

            int marginLeft = 60, marginBottom = 60, marginTop = 30, marginRight = 20;
            int chartW = getWidth() - marginLeft - marginRight;
            int chartH = getHeight() - marginTop - marginBottom;

            double max = 1;
            for (double[] v : data.values()) {
                max = Math.max(max, Math.max(v[0], v[1]));
            }

            g2.setColor(text);
            g2.drawLine(marginLeft, marginTop, marginLeft, marginTop + chartH);
            g2.drawLine(marginLeft, marginTop + chartH, marginLeft + chartW, marginTop + chartH);

            int n = data.size();
            int groupWidth = chartW / Math.max(n, 1);
            int barWidth = Math.max(10, groupWidth / 3);

            int i = 0;
            for (Map.Entry<String, double[]> entry : data.entrySet()) {
                int groupX = marginLeft + i * groupWidth;
                double income = entry.getValue()[0];
                double expense = entry.getValue()[1];

                int incomeH = (int) Math.round((income / max) * chartH);
                int expenseH = (int) Math.round((expense / max) * chartH);

                g2.setColor(new Color(46, 204, 113));
                g2.fillRect(groupX + groupWidth / 2 - barWidth - 2, marginTop + chartH - incomeH, barWidth, incomeH);

                g2.setColor(new Color(231, 76, 60));
                g2.fillRect(groupX + groupWidth / 2 + 2, marginTop + chartH - expenseH, barWidth, expenseH);

                g2.setColor(text);
                FontMetrics fm = g2.getFontMetrics();
                String label = entry.getKey();
                int labelW = fm.stringWidth(label);
                g2.drawString(label, groupX + groupWidth / 2 - labelW / 2, marginTop + chartH + 18);

                i++;
            }

            g2.setColor(new Color(46, 204, 113));
            g2.fillRect(marginLeft + chartW - 140, marginTop, 12, 12);
            g2.setColor(text);
            g2.drawString("Gelir", marginLeft + chartW - 122, marginTop + 11);

            g2.setColor(new Color(231, 76, 60));
            g2.fillRect(marginLeft + chartW - 70, marginTop, 12, 12);
            g2.setColor(text);
            g2.drawString("Gider", marginLeft + chartW - 52, marginTop + 11);
        }
    }

    public static void main(String[] args) {
        SwingUtilities.invokeLater(() -> new FinanceAppGUI().setVisible(true));
    }
}